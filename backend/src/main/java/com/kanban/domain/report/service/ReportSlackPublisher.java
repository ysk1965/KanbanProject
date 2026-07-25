package com.kanban.domain.report.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.integration.slack.SlackInstallation;
import com.kanban.domain.integration.slack.SlackInstallationRepository;
import com.kanban.domain.integration.slack.service.SlackApiClient;
import com.kanban.domain.integration.slack.service.SlackOAuthService;
import com.kanban.domain.report.BoardReportConfig;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.domain.report.source.ReportPeriod;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 슬랙에는 <b>30초 안에 읽히는 것</b>을 보낸다 — 헤드라인, 지표, 핵심(최대 10), 진행/완료 섹션,
 * 확인 필요(risks), 그리고 버튼. 커밋 목록 원문은 여전히 페이지 몫이라 3,000자 제한에 걸릴 일이 없다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReportSlackPublisher {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("M월 d일");

    private final SlackInstallationRepository installationRepository;
    private final SlackOAuthService slackOAuthService;
    private final SlackApiClient slackApiClient;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    /**
     * @return 실제로 게시했으면 true. 연결이 없거나 채널이 지정되지 않았으면 false.
     */
    public boolean publish(Board board, BoardReportConfig config, ReportType reportType,
                           ReportContent content, ReportPeriod period, String shareToken) {
        Optional<SlackInstallation> installationOpt = resolveInstallation(board);
        if (installationOpt.isEmpty()) {
            log.info("슬랙 연결이 없어 발송을 건너뜁니다 board={}", board.getId());
            return false;
        }
        SlackInstallation installation = installationOpt.get();

        String channelId = config.getSlackChannelId() != null && !config.getSlackChannelId().isBlank()
                ? config.getSlackChannelId()
                : installation.getDefaultChannelId();
        if (channelId == null || channelId.isBlank()) {
            log.info("게시할 채널이 지정되지 않았습니다 board={}", board.getId());
            return false;
        }

        List<Map<String, Object>> blocks = buildBlocks(reportType, content, period, shareToken, board.getId());
        try {
            String botToken = slackOAuthService.decryptBotToken(installation);
            slackApiClient.postMessage(botToken, channelId, blocks);
            return true;
        } catch (Exception e) {
            log.warn("슬랙 보고서 게시 실패 board={} channel={}: {}", board.getId(), channelId, e.getMessage());
            return false;
        }
    }

    private Optional<SlackInstallation> resolveInstallation(Board board) {
        Optional<SlackInstallation> boardLevel = installationRepository.findActiveByBoardId(board.getId());
        if (boardLevel.isPresent()) {
            return boardLevel;
        }
        if (board.getOrganization() == null) {
            return Optional.empty();
        }
        return installationRepository.findActiveByOrganizationId(board.getOrganization().getId());
    }

    private List<Map<String, Object>> buildBlocks(ReportType reportType, ReportContent content,
                                                  ReportPeriod period, String shareToken, String boardId) {
        boolean weekly = reportType == ReportType.WEEKLY_INTEGRATED;
        List<Map<String, Object>> blocks = new ArrayList<>();

        String title = weekly
                ? "🗂️ 주간 보고서 · " + period.startDate().format(DATE) + " ~ " + period.endDate().format(DATE)
                : "📮 일일 개발 보고서 · " + period.endDate().format(DATE);

        blocks.add(Map.of("type", "header",
                "text", Map.of("type", "plain_text", "text", title, "emoji", true)));
        blocks.add(Map.of("type", "divider"));

        if (content.getHeadline() != null && !content.getHeadline().isBlank()) {
            blocks.add(section("*" + content.getHeadline() + "*"));
        }

        String metricLine = buildMetricLine(content);
        if (metricLine != null) {
            blocks.add(section(metricLine));
        }

        if (content.getHighlights() != null && !content.getHighlights().isEmpty()) {
            String bullets = content.getHighlights().stream()
                    .limit(10)
                    .map(h -> "• " + h)
                    .collect(Collectors.joining("\n"));
            String label = weekly ? "*📌 이번 주 핵심*\n" : "*📌 오늘의 핵심*\n";
            blocks.add(section(label + bullets));
        }

        appendSections(blocks, content);
        appendRisks(blocks, content);

        blocks.add(Map.of("type", "actions",
                "elements", List.of(Map.of(
                        "type", "button",
                        "text", Map.of("type", "plain_text", "text", "전체 보고서 보기"),
                        "url", buildReportUrl(shareToken, boardId),
                        "style", "primary"))));

        blocks.add(Map.of("type", "context",
                "elements", List.of(Map.of("type", "mrkdwn",
                        "text", period.label() + " · BRIDGE 자동 보고서"))));
        return blocks;
    }

    /** 지표는 한 줄에 인라인으로 — 카드로 만들면 슬랙에서 세로로 길어진다. */
    private String buildMetricLine(ReportContent content) {
        if (content.getMetrics() == null || content.getMetrics().isEmpty()) {
            return null;
        }
        return content.getMetrics().stream()
                .limit(4)
                .map(m -> m.getLabel() + " *" + m.getValue() + "*")
                .collect(Collectors.joining("   ·   "));
    }

    /** 진행 중·완료 같은 섹션 본문. 지금까지 웹 페이지에만 있던 것을 슬랙에도 노출한다. */
    private void appendSections(List<Map<String, Object>> blocks, ReportContent content) {
        if (content.getSections() == null) {
            return;
        }
        for (ReportContent.Section s : content.getSections()) {
            if (s == null || s.getBody() == null || s.getBody().isBlank()) {
                continue;
            }
            String title = s.getTitle() != null && !s.getTitle().isBlank()
                    ? "*" + s.getTitle() + "*\n"
                    : "";
            blocks.add(section(title + s.getBody()));
        }
    }

    /** 확인이 필요한 것들 — ⚠️로 묶어 버튼 위에 붙인다. 소스 수집 실패 사실도 여기로 들어온다. */
    private void appendRisks(List<Map<String, Object>> blocks, ReportContent content) {
        if (content.getRisks() == null || content.getRisks().isEmpty()) {
            return;
        }
        String body = content.getRisks().stream()
                .map(r -> "• " + r)
                .collect(Collectors.joining("\n"));
        blocks.add(section("⚠️ *확인 필요*\n" + body));
    }

    /**
     * 공유 토큰이 있으면 로그인 없이 열리는 주소를, 없으면 보드 안쪽 주소를 가리킨다.
     */
    private String buildReportUrl(String shareToken, String boardId) {
        if (shareToken != null && !shareToken.isBlank()) {
            return frontendUrl + "/r/" + shareToken;
        }
        return frontendUrl + "/boards/" + boardId;
    }

    private Map<String, Object> section(String markdown) {
        String text = markdown.length() > 2900 ? markdown.substring(0, 2900) + "..." : markdown;
        return Map.of("type", "section", "text", Map.of("type", "mrkdwn", "text", text));
    }
}
