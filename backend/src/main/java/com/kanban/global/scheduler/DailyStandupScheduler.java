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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
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

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Scheduled(cron = "0 * * * * *")
    @Transactional
    public void processStandups() {
        LocalDateTime nowUtc = LocalDateTime.now(ZoneOffset.UTC);
        int currentHour = nowUtc.getHour();
        int currentMinute = nowUtc.getMinute();

        List<DailyStandupConfig> configs =
                configRepository.findEnabledByUtcTime(currentHour, currentMinute);

        if (configs.isEmpty()) {
            return;
        }

        log.info("Daily standup: processing {} board(s) at {:02d}:{:02d} UTC",
                configs.size(), currentHour, currentMinute);

        for (DailyStandupConfig config : configs) {
            try {
                processOneBoard(config, nowUtc);
            } catch (Exception e) {
                log.error("Failed to process standup for board {}: {}",
                        config.getBoard().getId(), e.getMessage(), e);
            }
        }
    }

    private void processOneBoard(DailyStandupConfig config, LocalDateTime nowUtc) {
        Board board = config.getBoard();

        // Premium 상태 확인
        board.checkAndUpdateTierIfTrialExpired();
        if (!board.canAccessSlack()) {
            log.info("Skipping standup for board {} - not premium", board.getId());
            return;
        }

        // 중복 발송 방지 (2분 이내)
        if (config.getLastSentAt() != null) {
            Duration sinceLastSent = Duration.between(config.getLastSentAt(), nowUtc);
            if (sinceLastSent.toMinutes() < 2) {
                return;
            }
        }

        // 1. 데이터 수집
        String dataJson = standupService.gatherBoardWideStandupData(config);

        ZoneId boardZone = ZoneId.of(config.getTimezone());
        LocalDate yesterday = ZonedDateTime.now(boardZone).toLocalDate().minusDays(1);

        // 2. 활동 없으면 AI 호출 생략, 간단 메시지 발송
        Map<String, Object> payload;
        if (dataJson == null) {
            log.info("No activity yesterday for board {} - sending empty notice", board.getId());
            boolean isKo = config.getLanguage() == null || config.getLanguage().startsWith("ko");
            String noActivityMsg = isKo
                    ? "어제는 기록된 활동이 없습니다."
                    : "No activity was recorded yesterday.";
            payload = buildSlackPayload(board, noActivityMsg, yesterday, config.getLanguage());
        } else {
            // 3. AI 요약 생성 (크레딧 차감 포함)
            String summary = reportAIService.generateStandupSummary(dataJson, config.getLanguage(), board.getId(), null);
            payload = buildSlackPayload(board, summary, yesterday, config.getLanguage());
        }

        // 4. Slack 발송 (활성화된 모든 멤버)
        List<BoardMember> members = boardMemberRepository.findByBoardId(board.getId());
        List<String> memberUserIds = members.stream()
                .map(m -> m.getUser().getId())
                .toList();

        List<MemberSlackWebhook> webhooks = webhookRepository
                .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), memberUserIds);

        if (webhooks.isEmpty()) {
            log.info("No active Slack webhooks for board {} - skipping delivery", board.getId());
        } else {
            sendToWebhooks(webhooks, payload, board.getId());
            log.info("Daily standup sent to {} webhook(s) for board {}", webhooks.size(), board.getId());
        }

        // 5. 발송 완료 표시
        config.markSent();
    }

    private Map<String, Object> buildSlackPayload(Board board, String summary,
                                                    LocalDate date, String language) {
        String boardUrl = frontendUrl + "/boards/" + board.getId();
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

    private void sendToWebhooks(List<MemberSlackWebhook> webhooks,
                                 Map<String, Object> payload, String boardId) {
        for (MemberSlackWebhook webhook : webhooks) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);
                restTemplate.postForEntity(webhook.getWebhookUrl(), entity, String.class);
            } catch (Exception e) {
                log.warn("Failed to send standup to webhook for board {}: {}",
                        boardId, e.getMessage());
            }
        }
    }
}
