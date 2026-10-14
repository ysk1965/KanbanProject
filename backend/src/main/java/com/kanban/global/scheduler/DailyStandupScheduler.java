package com.kanban.global.scheduler;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.integration.slack.MemberSlackWebhook;
import com.kanban.domain.integration.slack.MemberSlackWebhookRepository;
import com.kanban.domain.report.service.ReportAIService;
import com.kanban.domain.standup.DailyStandupConfig;
import com.kanban.domain.standup.DailyStandupConfigRepository;
import com.kanban.domain.standup.service.DailyStandupService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestTemplate;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Slf4j
@Component
@RequiredArgsConstructor
public class DailyStandupScheduler {

    private final DailyStandupConfigRepository configRepository;
    private final DailyStandupService standupService;
    private final ReportAIService reportAIService;
    private final MemberSlackWebhookRepository webhookRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final RestTemplate restTemplate;
    private final TransactionTemplate transactionTemplate;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    /**
     * 매분 실행. 메서드 전체에 트랜잭션을 걸지 않는다 — 예전에는 모든 보드의 AI 호출·Slack 발송이 하나의
     * 트랜잭션 안에서 돌아 보드 수 × LLM 왕복 동안 커넥션을 쥐고 있었다. 지금은 보드마다
     * 읽기(tx) → AI·Slack(트랜잭션 없음) → 발송 표시(tx)로 나눈다.
     */
    @Scheduled(cron = "0 * * * * *")
    @SchedulerLock(name = "DailyStandupScheduler.processStandups", lockAtMostFor = "50s", lockAtLeastFor = "20s")
    public void processStandups() {
        LocalDateTime nowUtc = LocalDateTime.now(ZoneOffset.UTC);
        int currentHour = nowUtc.getHour();
        int currentMinute = nowUtc.getMinute();

        List<String> configIds = transactionTemplate.execute(status ->
                configRepository.findEnabledByUtcTime(currentHour, currentMinute).stream()
                        .map(DailyStandupConfig::getId)
                        .toList());

        if (configIds == null || configIds.isEmpty()) {
            return;
        }

        log.info("Daily standup: processing {} board(s) at {:02d}:{:02d} UTC",
                configIds.size(), currentHour, currentMinute);

        for (String configId : configIds) {
            try {
                processOneBoard(configId, nowUtc);
            } catch (Exception e) {
                log.error("Failed to process standup for config {}: {}", configId, e.getMessage(), e);
            }
        }
    }

    /** 트랜잭션 안에서 읽어 둔 값 — AI·Slack 단계는 이 순수 값만 쓴다 */
    private record StandupInput(String boardId, String language, String timezone,
                                String dataJson, List<String> webhookUrls) {
    }

    private void processOneBoard(String configId, LocalDateTime nowUtc) {
        // 1. 보드 상태 확인 + 데이터 수집 (tx) — 트라이얼 만료 티어 갱신은 더티체킹으로 여기서 커밋된다
        StandupInput input = transactionTemplate.execute(status -> {
            DailyStandupConfig config = configRepository.findById(configId).orElse(null);
            if (config == null) {
                return null;
            }
            Board board = config.getBoard();

            // Premium 상태 확인
            board.checkAndUpdateTierIfTrialExpired();
            if (!board.canAccessSlack()) {
                log.info("Skipping standup for board {} - not premium", board.getId());
                return null;
            }

            // 중복 발송 방지 (2분 이내)
            if (config.getLastSentAt() != null) {
                Duration sinceLastSent = Duration.between(config.getLastSentAt(), nowUtc);
                if (sinceLastSent.toMinutes() < 2) {
                    return null;
                }
            }

            // 데이터 수집
            String dataJson = standupService.gatherBoardWideStandupData(config);

            // 발송 대상 웹훅 (BoardMember.user는 LAZY — 여기서 URL 문자열로 뽑아둔다)
            List<BoardMember> members = boardMemberRepository.findByBoardId(board.getId());
            List<String> memberUserIds = members.stream()
                    .map(m -> m.getUser().getId())
                    .toList();
            List<String> webhookUrls = webhookRepository
                    .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), memberUserIds).stream()
                    .map(MemberSlackWebhook::getWebhookUrl)
                    .toList();

            return new StandupInput(board.getId(), config.getLanguage(), config.getTimezone(), dataJson, webhookUrls);
        });
        if (input == null) {
            return;
        }

        String boardId = input.boardId();
        ZoneId boardZone = ZoneId.of(input.timezone());
        LocalDate yesterday = ZonedDateTime.now(boardZone).toLocalDate().minusDays(1);

        // 2. 활동 없으면 AI 호출 생략, 간단 메시지 발송
        Map<String, Object> payload;
        if (input.dataJson() == null) {
            log.info("No activity yesterday for board {} - sending empty notice", boardId);
            boolean isKo = input.language() == null || input.language().startsWith("ko");
            String noActivityMsg = isKo
                    ? "어제는 기록된 활동이 없습니다."
                    : "No activity was recorded yesterday.";
            payload = buildSlackPayload(boardId, noActivityMsg, yesterday, input.language());
        } else {
            // 3. AI 요약 생성 (크레딧 차감 포함) — 트랜잭션 없음
            String summary = reportAIService.generateStandupSummary(input.dataJson(), input.language(), boardId, null);
            payload = buildSlackPayload(boardId, summary, yesterday, input.language());
        }

        // 4. Slack 발송 (활성화된 모든 멤버) — 트랜잭션 없음
        if (input.webhookUrls().isEmpty()) {
            log.info("No active Slack webhooks for board {} - skipping delivery", boardId);
        } else {
            sendToWebhooks(input.webhookUrls(), payload, boardId);
            log.info("Daily standup sent to {} webhook(s) for board {}", input.webhookUrls().size(), boardId);
        }

        // 5. 발송 완료 표시 (tx)
        transactionTemplate.executeWithoutResult(status ->
                configRepository.findById(configId).ifPresent(DailyStandupConfig::markSent));
    }

    private Map<String, Object> buildSlackPayload(String boardId, String summary,
                                                    LocalDate date, String language) {
        String boardUrl = frontendUrl + "/boards/" + boardId;
        String dateStr = date.format(DateTimeFormatter.ISO_LOCAL_DATE);
        boolean isKo = language == null || language.startsWith("ko");

        List<Map<String, Object>> blocks = new ArrayList<>();

        // Header
        blocks.add(Map.of("type", "header",
                "text", Map.of("type", "plain_text",
                        "text", "\u2615 BRIDGE - " + (isKo
                                ? "\ub370\uc77c\ub9ac \uc2a4\ud0e0\ub4dc\uc5c5 (" + dateStr + ")"
                                : "Daily Standup (" + dateStr + ")"),
                        "emoji", true)));

        // Divider
        blocks.add(Map.of("type", "divider"));

        // Summary content
        String truncatedSummary = summary.length() > 2900
                ? summary.substring(0, 2900) + "..." : summary;
        blocks.add(Map.of("type", "section",
                "text", Map.of("type", "mrkdwn", "text", truncatedSummary)));

        // Divider
        blocks.add(Map.of("type", "divider"));

        // Action button
        blocks.add(Map.of("type", "actions",
                "elements", List.of(
                        Map.of("type", "button",
                                "text", Map.of("type", "plain_text",
                                        "text", isKo ? "BRIDGE\uc5d0\uc11c \ubcf4\uae30" : "View in BRIDGE"),
                                "url", boardUrl,
                                "style", "primary")
                )));

        // Footer
        blocks.add(Map.of("type", "context",
                "elements", List.of(
                        Map.of("type", "mrkdwn",
                                "text", isKo
                                        ? "BRIDGE \ub370\uc77c\ub9ac \uc2a4\ud0e0\ub4dc\uc5c5 | \ubcf4\ub4dc \uc124\uc815\uc5d0\uc11c \ube44\ud65c\uc131\ud654\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4"
                                        : "BRIDGE Daily Standup | Disable in board notification settings")
                )));

        return Map.of("blocks", blocks);
    }

    private void sendToWebhooks(List<String> webhookUrls,
                                 Map<String, Object> payload, String boardId) {
        for (String webhookUrl : webhookUrls) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);
                restTemplate.postForEntity(webhookUrl, entity, String.class);
            } catch (Exception e) {
                log.warn("Failed to send standup to webhook for board {}: {}",
                        boardId, e.getMessage());
            }
        }
    }
}
