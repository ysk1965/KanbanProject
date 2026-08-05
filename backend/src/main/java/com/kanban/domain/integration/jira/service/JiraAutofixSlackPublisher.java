package com.kanban.domain.integration.jira.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.integration.jira.AutofixJobStatus;
import com.kanban.domain.integration.jira.JiraAutofixJob;
import com.kanban.domain.integration.slack.SlackInstallation;
import com.kanban.domain.integration.slack.service.SlackApiClient;
import com.kanban.domain.integration.slack.service.SlackOAuthService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 자동수정 결과를 슬랙 채널에 남긴다 — 보드에 지정한 <b>자동수정 전용 채널</b> 하나로 나가고,
 * 지정이 없으면 슬랙 설치의 기본 채널로 떨어진다.
 *
 * <p>도크를 열어야만 결과를 알 수 있던 자리를 메운다. JIRA 결과 댓글은 이슈를 보는 사람에게만
 * 닿지만, PR은 리뷰어가 있어야 진행되고 실패는 러너를 손봐야 풀리므로 팀이 보는 곳에 한 번 더 남긴다.
 *
 * <p><b>실패해도 조용히 넘어간다.</b> 이 시점에 작업 상태는 이미 확정됐고, 슬랙 게시가 안 됐다고
 * 되돌릴 수 있는 것이 없다 — 여기서 예외를 올리면 확정된 결과를 기록한 트랜잭션만 깨진다.
 *
 * <p>사람이 취소한 건({@code CANCELLED})은 보내지 않는다. 파이프라인의 결과가 아니라
 * 이미 화면 앞에 있는 사람이 한 행동이다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JiraAutofixSlackPublisher {

    /** 실패 메시지에 붙일 로그 꼬리 길이. 원인을 알아보기엔 충분하고, 채널을 덮지는 않는 크기. */
    private static final int LOG_TAIL = 600;

    private final SlackOAuthService slackOAuthService;
    private final SlackApiClient slackApiClient;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    /**
     * 종료된 작업 한 건을 게시한다.
     *
     * @param issueTitle  카드 제목. 이슈키만으로는 채널에서 무슨 건인지 알 수 없다.
     * @param jiraBaseUrl JIRA 사이트 주소(없으면 이슈 링크 버튼을 빼고 보낸다)
     * @param configuredChannelId 자동수정 전용 채널. 비어 있으면 설치 기본 채널로 떨어진다.
     */
    /**
     * @param corrected 회수된 뒤 늦게 도착한 회신으로 결과가 뒤집힌 경우. 채널에는 이미
     *                  "시간 초과 회수" 메시지가 올라가 있으므로, 정정임을 밝히지 않으면
     *                  같은 이슈에 상반된 두 결과가 나란히 남아 어느 쪽이 사실인지 알 수 없다.
     */
    public void publish(Board board, JiraAutofixJob job, String issueTitle, String jiraBaseUrl,
                        String configuredChannelId, boolean corrected) {
        if (board == null || job == null) return;
        if (job.getStatus() == AutofixJobStatus.CANCELLED) return;

        try {
            String channelId = resolveChannel(board, configuredChannelId);
            if (channelId == null) return;

            String botToken = slackOAuthService.decryptBotToken(
                    slackOAuthService.findActiveInstallation(board).orElseThrow());
            slackApiClient.postMessage(botToken, channelId,
                    buildBlocks(board, job, issueTitle, jiraBaseUrl, corrected));
            log.info("Autofix Slack: board={} issue={} status={} corrected={} → {}",
                    board.getId(), job.getJiraIssueKey(), job.getStatus(), corrected, channelId);
        } catch (Exception e) {
            // 대표 사유: 채널에 봇(MILKYWAY)이 초대되지 않음(not_in_channel), 토큰 만료.
            log.warn("Autofix Slack 게시 실패 board={} issue={}: {}",
                    board.getId(), job.getJiraIssueKey(), e.getMessage());
        }
    }

    /**
     * 러너가 소식이 끊겼음을 알린다 — 작업 결과가 아니라 <b>러너 자체</b>에 대한 알림이다.
     *
     * <p>작업 단위 알림만 있으면 큐가 빈 채로 러너가 죽었을 때 아무 신호도 나가지 않는다.
     * 그동안 트리아지는 계속 후보를 쌓지만 아무도 가져가지 않는다.
     *
     * @param seenAt 마지막으로 말을 걸어온 시각. "언제부터"가 있어야 맥을 손볼지 기다릴지 판단한다.
     * @param queued 대기 중인 작업 수 — 지금 멈춰 있는 일의 양이다.
     */
    public void publishRunnerOffline(Board board, String runnerName, LocalDateTime seenAt,
                                     int queued, String configuredChannelId) {
        if (board == null) return;

        try {
            String channelId = resolveChannel(board, configuredChannelId);
            if (channelId == null) return;

            String botToken = slackOAuthService.decryptBotToken(
                    slackOAuthService.findActiveInstallation(board).orElseThrow());
            slackApiClient.postMessage(botToken, channelId,
                    buildOfflineBlocks(board, runnerName, seenAt, queued));
            log.info("Autofix Slack: 러너 무응답 알림 board={} runner={} → {}",
                    board.getId(), runnerName, channelId);
        } catch (Exception e) {
            log.warn("Autofix Slack 러너 알림 실패 board={}: {}", board.getId(), e.getMessage());
        }
    }

    /** 전용 채널 → 설치 기본 채널 순. 둘 다 없으면 어디로 보낼지 고를 수 없으므로 보내지 않는다. */
    private String resolveChannel(Board board, String configuredChannelId) {
        SlackInstallation installation = slackOAuthService.findActiveInstallation(board).orElse(null);
        if (installation == null) return null;

        String channelId = configuredChannelId != null && !configuredChannelId.isBlank()
                ? configuredChannelId
                : installation.getDefaultChannelId();
        if (channelId == null || channelId.isBlank()) {
            log.debug("Autofix Slack: 게시할 채널이 없어 건너뜁니다 board={}", board.getId());
            return null;
        }
        return channelId;
    }

    // ── 메시지 ────────────────────────────────────

    private List<Map<String, Object>> buildBlocks(Board board, JiraAutofixJob job,
                                                  String issueTitle, String jiraBaseUrl,
                                                  boolean corrected) {
        List<Map<String, Object>> blocks = new ArrayList<>();

        blocks.add(Map.of("type", "header",
                "text", Map.of("type", "plain_text",
                        "text", clip(headline(job.getStatus()) + " " + job.getJiraIssueKey(), 150),
                        "emoji", true)));

        if (corrected) {
            blocks.add(section(":arrows_counterclockwise: *앞선 「시간 초과 회수」를 정정합니다.* "
                    + "러너는 정상적으로 끝냈고 회신만 늦게 도착했습니다. 아래가 실제 결과입니다."));
        }

        if (issueTitle != null && !issueTitle.isBlank()) {
            blocks.add(section("*" + escape(clip(issueTitle, 200)) + "*"));
        }

        blocks.add(Map.of("type", "section", "fields", fields(job)));

        if (job.getStatus() == AutofixJobStatus.FAILED && job.getFailureReason() != null) {
            blocks.add(section("*사유* " + escape(clip(job.getFailureReason(), 500))));
        }
        if (job.getStatus() == AutofixJobStatus.FAILED && job.getLogExcerpt() != null) {
            blocks.add(section("```" + tail(job.getLogExcerpt(), LOG_TAIL) + "```"));
        }
        if (job.getStatus() == AutofixJobStatus.TIMED_OUT) {
            blocks.add(section("러너가 회신하지 않아 서버가 회수했습니다. "
                    + "맥의 Unity에 모달이 떠 있는지, 러너 데몬이 살아 있는지 확인하세요."));
        }

        List<Map<String, Object>> actions = actions(board, job, jiraBaseUrl);
        if (!actions.isEmpty()) {
            blocks.add(Map.of("type", "actions", "elements", actions));
        }

        if (job.getStatus() == AutofixJobStatus.SUCCEEDED) {
            blocks.add(Map.of("type", "context", "elements", List.of(Map.of("type", "mrkdwn",
                    "text", "자동 검증은 컴파일 통과까지입니다. 동작은 확인되지 않았으니 머지 전 검토가 필요합니다."))));
        }
        return blocks;
    }

    private List<Map<String, Object>> buildOfflineBlocks(Board board, String runnerName,
                                                         LocalDateTime seenAt, int queued) {
        List<Map<String, Object>> blocks = new ArrayList<>();

        blocks.add(Map.of("type", "header",
                "text", Map.of("type", "plain_text",
                        "text", clip("⚠️ 자동수정 러너 무응답"
                                + (runnerName != null ? " · " + runnerName : ""), 150),
                        "emoji", true)));

        blocks.add(section("대기 중인 작업 *" + queued + "건*이 처리되지 않고 있습니다."
                + (seenAt != null ? " 마지막 응답은 " + seenAt + " (UTC)입니다." : "")));

        // 원인이 대부분 이 셋이라 매번 같은 것을 물어보게 된다. 답을 메시지에 넣어 왕복을 줄인다.
        blocks.add(section("*확인 순서*\n"
                + "1. 맥이 깨어 있는지 (잠들면 러너도 멈춥니다)\n"
                + "2. `launchctl list | grep bridge.autofix` — 데몬이 살아 있는지\n"
                + "3. `~/bridge-autofix/logs/runner.log` — 마지막 오류"));

        blocks.add(Map.of("type", "actions", "elements",
                List.of(linkButton("자동수정 도크", frontendUrl + "/boards/" + board.getId(), true))));

        return blocks;
    }

    /** 채널 목록에서 결과가 바로 읽히도록 상태를 헤드라인 앞에 둔다. */
    private String headline(AutofixJobStatus status) {
        return switch (status) {
            case SUCCEEDED -> "✅ PR 생성 ·";
            case NO_CHANGE -> "➖ 변경 없음 ·";
            case FAILED -> "❌ 자동수정 실패 ·";
            case TIMED_OUT -> "⏱️ 시간 초과 회수 ·";
            default -> "자동수정 ·";
        };
    }

    private List<Map<String, Object>> fields(JiraAutofixJob job) {
        List<Map<String, Object>> fields = new ArrayList<>();
        if (job.getRepoFullName() != null) {
            fields.add(field("*저장소*\n" + escape(job.getRepoFullName())));
        }
        if (job.getConfidence() != null) {
            fields.add(field(String.format("*트리아지 confidence*\n%.2f", job.getConfidence())));
        }
        String elapsed = elapsed(job);
        if (elapsed != null) {
            fields.add(field("*소요*\n" + elapsed));
        }
        if (job.getRunnerName() != null) {
            fields.add(field("*러너*\n" + escape(job.getRunnerName())));
        }
        return fields;
    }

    private List<Map<String, Object>> actions(Board board, JiraAutofixJob job, String jiraBaseUrl) {
        List<Map<String, Object>> actions = new ArrayList<>();
        if (job.getPrUrl() != null && !job.getPrUrl().isBlank()) {
            actions.add(linkButton("PR 열기", job.getPrUrl(), true));
        }
        if (jiraBaseUrl != null && !jiraBaseUrl.isBlank()) {
            actions.add(linkButton("JIRA 이슈",
                    trimSlash(jiraBaseUrl) + "/browse/" + job.getJiraIssueKey(), false));
        }
        actions.add(linkButton("자동수정 도크", frontendUrl + "/boards/" + board.getId(), false));
        return actions;
    }

    /**
     * 러너가 실제로 붙잡고 있던 시간. 한 건에 얼마가 걸리는지가 하루 처리량을 지배하는 값이라
     * 매번 눈에 띄는 곳에 남긴다.
     */
    private String elapsed(JiraAutofixJob job) {
        if (job.getDispatchedAt() == null || job.getCompletedAt() == null) return null;
        long minutes = Duration.between(job.getDispatchedAt(), job.getCompletedAt()).toMinutes();
        return minutes < 1 ? "1분 미만" : minutes + "분";
    }

    // ── 블록 조각 ──────────────────────────────────

    private Map<String, Object> section(String mrkdwn) {
        return Map.of("type", "section", "text", Map.of("type", "mrkdwn", "text", mrkdwn));
    }

    private Map<String, Object> field(String mrkdwn) {
        return Map.of("type", "mrkdwn", "text", mrkdwn);
    }

    private Map<String, Object> linkButton(String label, String url, boolean primary) {
        Map<String, Object> button = new java.util.HashMap<>();
        button.put("type", "button");
        button.put("text", Map.of("type", "plain_text", "text", label));
        button.put("url", url);
        if (primary) button.put("style", "primary");
        return button;
    }

    // ── 문자열 ────────────────────────────────────

    /** 슬랙 mrkdwn의 링크 문법(&lt;...&gt;)으로 오해될 문자만 막는다. */
    private static String escape(String value) {
        return value == null ? "" : value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String clip(String value, int limit) {
        if (value == null) return "";
        return value.length() <= limit ? value : value.substring(0, limit - 1) + "…";
    }

    /** 로그는 뒤쪽에 원인이 있다 — 앞을 자른다. */
    private static String tail(String value, int limit) {
        String cleaned = value.replace("```", "'''");
        return cleaned.length() <= limit ? cleaned : "…" + cleaned.substring(cleaned.length() - limit);
    }

    private static String trimSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
