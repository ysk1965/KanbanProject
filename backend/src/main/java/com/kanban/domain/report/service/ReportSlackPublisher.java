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
     * 발송 대상 채널 하나.
     *
     * @param isDefault 사용자가 채널을 하나도 지정하지 않아 설치 <b>기본 채널</b>로 나가는 경우
     */
    public record Target(String channelId, String channelName, boolean isDefault) {}

    /** 실제로 게시된 메시지 하나 — 나중에 회수(chat.delete)하려면 채널 + ts가 필요하다. */
    public record SentMessage(String channelId, String channelName, String messageTs) {}

    /** 회수 대상 한 건. 저장된 발송 기록에서 채널·ts만 뽑아 넘긴다. */
    public record Recallable(String channelId, String messageTs) {}

    /**
     * 게시 결과. 채널 하나가 실패해도 나머지는 그대로 나간다 — 한 채널의 권한 문제로
     * 팀 전체가 보고서를 못 받는 일이 없게 한다.
     *
     * @param sentMessages 게시 성공 메시지의 채널·ts. 삭제 시 슬랙 메시지를 회수하기 위해 저장한다.
     *                     ts를 못 받은(구버전 응답 등) 성공 건은 {@code sent}에는 있어도 여기엔 빠진다.
     */
    public record PublishOutcome(List<Target> sent, List<SentMessage> sentMessages,
                                 List<Target> failed, String error) {
        /** 발송 실패·건너뜀 등 게시가 아예 없던 경우용(성공 메시지 없음). */
        public PublishOutcome(List<Target> sent, List<Target> failed, String error) {
            this(sent, List.of(), failed, error);
        }

        public boolean anySent() {
            return !sent.isEmpty();
        }

        public boolean allSent() {
            return failed.isEmpty() && !sent.isEmpty();
        }
    }

    /**
     * 켜져 있는 모든 발송 채널에 게시한다. 채널마다 1회 재시도하므로 성공한 채널에 같은 글이
     * 두 번 올라가지 않는다.
     */
    public PublishOutcome publish(Board board, BoardReportConfig config, ReportType reportType,
                                  ReportContent content, ReportPeriod period, String shareToken) {
        Optional<SlackInstallation> installationOpt = resolveInstallation(board);
        if (installationOpt.isEmpty()) {
            log.info("슬랙 연결이 없어 발송을 건너뜁니다 board={}", board.getId());
            return new PublishOutcome(List.of(), List.of(), "이 보드에 슬랙이 연결되어 있지 않습니다.");
        }
        SlackInstallation installation = installationOpt.get();

        List<Target> targets = resolveTargets(board, config);
        if (targets.isEmpty()) {
            log.info("게시할 채널이 지정되지 않았습니다 board={}", board.getId());
            return new PublishOutcome(List.of(), List.of(), "게시할 슬랙 채널이 지정되지 않았습니다.");
        }

        List<Map<String, Object>> blocks = buildBlocks(reportType, content, period, shareToken, board.getId());
        String botToken;
        try {
            botToken = slackOAuthService.decryptBotToken(installation);
        } catch (Exception e) {
            log.warn("슬랙 토큰 복호화 실패 board={}: {}", board.getId(), e.getMessage());
            return new PublishOutcome(List.of(), targets, "슬랙 인증 정보를 읽지 못했습니다.");
        }

        List<Target> sent = new ArrayList<>();
        List<SentMessage> sentMessages = new ArrayList<>();
        List<Target> failed = new ArrayList<>();
        for (Target target : targets) {
            String ts = postWithRetry(botToken, target, blocks, board);
            if (ts != null) {
                sent.add(target);
                // ts가 비면(응답에 없던 드문 경우) 게시는 됐지만 회수 대상으로는 못 남긴다.
                if (!ts.isBlank()) {
                    sentMessages.add(new SentMessage(target.channelId(), target.channelName(), ts));
                }
            } else {
                failed.add(target);
            }
        }
        String error = failed.isEmpty() ? null
                : "슬랙 게시 실패: " + failed.stream().map(this::label).collect(Collectors.joining(", "));
        return new PublishOutcome(sent, sentMessages, failed, error);
    }

    /**
     * 채널 하나에 게시. 첫 시도가 실패하면 한 번만 더 시도한다(그 채널만).
     *
     * @return 게시 성공 시 메시지 ts(응답에 없으면 빈 문자열), 실패 시 {@code null}
     */
    private String postWithRetry(String botToken, Target target,
                                 List<Map<String, Object>> blocks, Board board) {
        for (int attempt = 1; attempt <= 2; attempt++) {
            try {
                Map<String, Object> resp = slackApiClient.postMessage(botToken, target.channelId(), blocks);
                Object ts = resp != null ? resp.get("ts") : null;
                return ts != null ? String.valueOf(ts) : "";
            } catch (Exception e) {
                log.warn("슬랙 보고서 게시 실패({}차) board={} channel={}: {}",
                        attempt, board.getId(), target.channelId(), e.getMessage());
            }
        }
        return null;
    }

    /**
     * 게시된 보고서 메시지들을 슬랙에서 회수한다({@code chat.delete}). 보고서 삭제 시 호출한다.
     * 채널 하나가 실패해도(이미 지워짐·권한 등) 나머지는 계속 지운다 — best-effort.
     *
     * @return 실제로 삭제된 메시지 수
     */
    public int recall(Board board, List<Recallable> messages) {
        if (messages == null || messages.isEmpty()) {
            return 0;
        }
        Optional<SlackInstallation> installationOpt = resolveInstallation(board);
        if (installationOpt.isEmpty()) {
            log.info("슬랙 연결이 없어 메시지 회수를 건너뜁니다 board={}", board.getId());
            return 0;
        }
        String botToken;
        try {
            botToken = slackOAuthService.decryptBotToken(installationOpt.get());
        } catch (Exception e) {
            log.warn("슬랙 토큰 복호화 실패로 메시지 회수 불가 board={}: {}", board.getId(), e.getMessage());
            return 0;
        }
        int deleted = 0;
        for (Recallable m : messages) {
            if (m.channelId() == null || m.messageTs() == null) {
                continue;
            }
            try {
                slackApiClient.chatDelete(botToken, m.channelId(), m.messageTs());
                deleted++;
            } catch (Exception e) {
                log.warn("슬랙 메시지 회수 실패 board={} channel={} ts={}: {}",
                        board.getId(), m.channelId(), m.messageTs(), e.getMessage());
            }
        }
        return deleted;
    }

    /** 채널 하나의 테스트 결과. */
    public record ChannelTestResult(String channelId, String channelName, boolean sent, String error) {}

    /** 발송 테스트 결과 묶음. sent=true면 <b>모든</b> 대상 채널에 게시가 성공한 것이다. */
    public record TestOutcome(boolean sent, List<ChannelTestResult> results, String error) {}

    /**
     * 실제 발송에 쓰일 채널 목록. 지정된 채널이 있으면 그대로, 하나도 없으면 설치 기본 채널 하나.
     * 슬랙 연결이 없거나 기본 채널조차 없으면 빈 목록이다.
     */
    public List<Target> resolveTargets(Board board, BoardReportConfig config) {
        List<Target> explicit = config.getDeliveryChannels().stream()
                .filter(ch -> ch.getSlackChannelId() != null && !ch.getSlackChannelId().isBlank())
                .map(ch -> new Target(ch.getSlackChannelId(), ch.getSlackChannelName(), false))
                .toList();
        if (!explicit.isEmpty()) {
            return explicit;
        }
        return resolveInstallation(board)
                .filter(inst -> inst.getDefaultChannelId() != null && !inst.getDefaultChannelId().isBlank())
                .map(inst -> List.of(new Target(inst.getDefaultChannelId(), inst.getDefaultChannelName(), true)))
                .orElseGet(List::of);
    }

    /**
     * 자동 예약을 켜기 전에 채널·권한을 검증하는 가벼운 테스트 게시. 보고서 수집·AI를 태우지 않고
     * 확인 메시지 한 장만 보낸다 — 활동이 없는 날에도 "이 채널로 게시가 되는지"를 확실히 가른다.
     *
     * @param onlyChannelId 지정하면 그 채널만 테스트한다(목록에서 한 줄만 다시 확인할 때). null이면 전부.
     */
    public TestOutcome sendTestMessage(Board board, BoardReportConfig config, String onlyChannelId) {
        Optional<SlackInstallation> installationOpt = resolveInstallation(board);
        if (installationOpt.isEmpty()) {
            return new TestOutcome(false, List.of(), "이 보드에 슬랙이 연결되어 있지 않습니다.");
        }
        SlackInstallation installation = installationOpt.get();

        List<Target> targets = resolveTargets(board, config).stream()
                .filter(t -> onlyChannelId == null || onlyChannelId.equals(t.channelId()))
                .toList();
        if (targets.isEmpty()) {
            return new TestOutcome(false, List.of(),
                    "게시할 채널이 지정되지 않았습니다. 발송 채널을 먼저 선택하세요.");
        }

        List<Map<String, Object>> blocks = List.of(section(
                "✅ *BRIDGE 보고서 발송 테스트*\n"
                + "이 채널로 자동 개발 보고서가 게시됩니다. 이 메시지가 보이면 채널·권한 설정이 정상입니다."));
        String botToken;
        try {
            botToken = slackOAuthService.decryptBotToken(installation);
        } catch (Exception e) {
            return new TestOutcome(false, List.of(), "슬랙 인증 정보를 읽지 못했습니다.");
        }

        List<ChannelTestResult> results = new ArrayList<>();
        for (Target target : targets) {
            try {
                slackApiClient.postMessage(botToken, target.channelId(), blocks);
                results.add(new ChannelTestResult(target.channelId(), target.channelName(), true, null));
            } catch (Exception e) {
                log.warn("발송 테스트 실패 board={} channel={}: {}",
                        board.getId(), target.channelId(), e.getMessage());
                results.add(new ChannelTestResult(target.channelId(), target.channelName(), false,
                        "게시하지 못했습니다. 채널에 MILKYWAY(봇)를 초대했는지 확인하세요."));
            }
        }
        boolean allSent = results.stream().allMatch(ChannelTestResult::sent);
        String error = allSent ? null
                : results.stream().filter(r -> !r.sent())
                        .map(r -> "#" + (r.channelName() != null ? r.channelName() : r.channelId()))
                        .collect(Collectors.joining(", ")) + " 게시에 실패했습니다. 채널에 MILKYWAY(봇)를 초대했는지 확인하세요.";
        return new TestOutcome(allSent, results, error);
    }

    private String label(Target target) {
        return "#" + (target.channelName() != null && !target.channelName().isBlank()
                ? target.channelName() : target.channelId());
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

        String sprintLine = buildSprintLine(content.getSprint());
        if (sprintLine != null) {
            blocks.add(section(sprintLine));
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
        appendLateRollup(blocks, content);
        appendRisks(blocks, content);

        List<Map<String, Object>> actions = new ArrayList<>();
        actions.add(Map.of(
                "type", "button",
                "text", Map.of("type", "plain_text", "text", "전체 보고서 보기"),
                "url", buildReportUrl(shareToken, boardId),
                "style", "primary"));
        // 지연이 있으면 보고서를 거치지 않고 곧장 처리 화면으로 갈 수 있게 두 번째 버튼을 붙인다.
        if (lateTotal(content) > 0) {
            actions.add(Map.of(
                    "type", "button",
                    "text", Map.of("type", "plain_text", "text", "지연만 보드에서 보기"),
                    "url", frontendUrl + "/boards/" + boardId + "?view=kanban&overdue=1"));
        }
        blocks.add(Map.of("type", "actions", "elements", actions));

        blocks.add(Map.of("type", "context",
                "elements", List.of(Map.of("type", "mrkdwn",
                        "text", period.label() + " · BRIDGE 자동 보고서"))));
        return blocks;
    }

    /** 스프린트 진행 바의 칸 수. 슬랙 모바일에서도 한 줄에 들어가는 폭. */
    private static final int SPRINT_BAR_WIDTH = 20;

    /**
     * 커밋·기여자 같은 "얼마나 움직였나"가 아니라 "목표에 얼마나 가까워졌나"를 헤더에 둔다.
     * 값은 시스템이 스프린트 도메인에서 집계한 것(AI 미개입)이라 지어낸 숫자가 아니다.
     * 활성 스프린트가 없으면 null — 이때는 헤더에 진행 라인을 넣지 않는다.
     *
     * <pre>
     * 🎯 2분기 로드맵 › *Sprint 3* · 진행중
     * ████████▓▓▒▒░░░░░░░░ *40%*  (65/164)
     * └ 전체 *164* · 완료 *65* · 진행 *10* · 지연 *10* · 남은 *79*
     * </pre>
     *
     * 슬랙 mrkdwn은 색을 못 넣으므로 구간은 음영 문자(█ 완료 / ▓ 진행 / ▒ 지연 / ░ 남은)로 구분한다.
     */
    private String buildSprintLine(ReportContent.Sprint sprint) {
        if (sprint == null || sprint.getTotal() <= 0) {
            return null;
        }
        int total = sprint.getTotal();
        int done = Math.max(0, sprint.getDone());
        int inProgress = Math.max(0, sprint.getInProgress());
        int delayed = Math.max(0, sprint.getDelayed());
        int remaining = Math.max(0, total - done - inProgress - delayed);

        String name = sprint.getName() != null && !sprint.getName().isBlank()
                ? sprint.getName() : "스프린트";
        // 마일스톤은 스프린트의 상위 맥락 — 브레드크럼(마일스톤 › 스프린트)으로 앞에 둔다.
        String prefix = sprint.getMilestone() != null && !sprint.getMilestone().isBlank()
                ? sprint.getMilestone() + " › " : "";
        String bar = buildSprintBar(done, inProgress, delayed, total);

        return "🎯 " + prefix + "*" + name + "* · 진행중"
                + "\n" + bar + "  *" + sprint.getPercentage() + "%*  (" + done + "/" + total + ")"
                + "\n└ 전체 *" + total + "* · 완료 *" + done + "* · 진행 *" + inProgress
                + "* · 지연 *" + delayed + "* · 남은 *" + remaining + "*";
    }

    /**
     * 누적 반올림으로 각 구간 폭을 계산해 합이 항상 {@link #SPRINT_BAR_WIDTH}가 되게 한다.
     * 구간별로 따로 반올림하면 합이 폭을 넘거나 모자란다.
     */
    private String buildSprintBar(int done, int inProgress, int delayed, int total) {
        int w = SPRINT_BAR_WIDTH;
        int c1 = Math.round((float) done / total * w);
        int c2 = Math.round((float) (done + inProgress) / total * w);
        int c3 = Math.round((float) (done + inProgress + delayed) / total * w);
        int dw = c1;
        int iw = Math.max(0, c2 - c1);
        int lw = Math.max(0, c3 - c2);
        int rw = Math.max(0, w - dw - iw - lw);
        return "█".repeat(dw) + "▓".repeat(iw) + "▒".repeat(lw) + "░".repeat(rw);
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

    /** 지연 총량. 담당자별 지연 건수의 합이며, 0이면 지연 관련 블록을 아예 그리지 않는다. */
    private int lateTotal(ReportContent content) {
        if (content.getMembers() == null) {
            return 0;
        }
        return content.getMembers().stream()
                .mapToInt(m -> Math.max(0, m.getLateCount()))
                .sum();
    }

    /**
     * 지연 롤업 — 슬랙에서 "누가 막혔나"를 보고서를 열지 않고도 알게 한다.
     *
     * <p>총량과 담당자별 건수까지만 세운다. 개별 항목 목록은 슬랙 메시지를 길게 만들기만 하므로
     * 아래 "지연만 보드에서 보기" 버튼으로 넘긴다.
     */
    private void appendLateRollup(List<Map<String, Object>> blocks, ReportContent content) {
        int total = lateTotal(content);
        if (total == 0) {
            return;
        }
        List<ReportContent.Member> holders = content.getMembers().stream()
                .filter(m -> m.getLateCount() > 0)
                .sorted(Comparator.comparingInt(ReportContent.Member::getLateCount).reversed())
                .toList();
        String names = holders.stream()
                .map(m -> escape(m.getName()) + " " + m.getLateCount())
                .collect(Collectors.joining(" · "));

        blocks.add(section("⏰ *지연 " + total + "건* · 담당 " + holders.size() + "명\n" + names));
    }

    /** 슬랙 mrkdwn 예약문자 이스케이프 — 제목에 &lt;, &gt;가 들어오면 링크 문법이 깨진다. */
    private String escape(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
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
