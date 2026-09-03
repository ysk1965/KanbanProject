package com.kanban.domain.integration.slack.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.checklist.dto.ChecklistRequest;
import com.kanban.domain.checklist.service.ChecklistService;
import com.kanban.domain.feature.service.InboxFeatureService;
import com.kanban.domain.integration.slack.SlackInstallation;
import com.kanban.domain.integration.slack.SlackInstallationRepository;
import com.kanban.domain.integration.slack.SlackUserLink;
import com.kanban.domain.integration.slack.SlackUserLinkRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 슬랙에서 봇을 멘션하면({@code @MILKYWAY 할 일 내용}) 체크리스트 항목을 만들어 준다.
 *
 * <p>흐름: 멘션 → 봇이 스레드에 "어느 태스크에 추가할까요?" 프롬프트(태스크 검색 셀렉트 +
 * 미분류 바로 추가 버튼)를 답장 → 셀렉트 타이핑은 {@code block_suggestion}으로 태스크를 검색하고,
 * 선택/버튼 클릭({@code block_actions})에서 실제로 항목을 생성한 뒤 프롬프트 메시지를 결과로 갈아끼운다.
 * 항목 제목·보드는 프롬프트 메시지의 metadata에 실어 인터랙션까지 전달한다.
 *
 * <p>보드 결정 규칙: 워크스페이스(team)의 활성 보드 설치 중
 * ① 기본 채널이 멘션 채널과 일치하는 설치 → ② 보드 설치가 하나뿐이면 그 설치.
 * 둘 다 아니면 어느 보드인지 알 수 없으므로 안내만 남긴다.
 *
 * <p>작성자 결정 규칙: 조작한 슬랙 유저가 BRIDGE 계정과 연결돼 있고 그 보드 멤버면
 * 본인 명의로 생성 + 본인에게 배정한다. 아니면 앱 설치자 명의로 담당자 없이 생성한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SlackMentionChecklistService {

    /** 태스크 검색 셀렉트 (external_select — 타이핑할 때마다 block_suggestion으로 검색어가 온다) */
    public static final String ACTION_TASK_SELECT = "bridge_cl_task_select";
    /** "미분류에 바로 추가" 버튼 */
    public static final String ACTION_ADD_INBOX = "bridge_cl_add_inbox";
    /** block_suggestion에는 message metadata가 없으므로 block_id에 보드를 싣는다 */
    private static final String BLOCK_ID_PREFIX = "bridge_cl_prompt:";
    private static final String METADATA_EVENT_TYPE = "bridge_checklist_prompt";

    private static final int TITLE_MAX_LENGTH = 200;
    private static final int OPTION_TEXT_MAX_LENGTH = 75;
    private static final int MAX_SUGGESTIONS = 20;

    private final SlackInstallationRepository installationRepository;
    private final SlackUserLinkRepository userLinkRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final SlackOAuthService slackOAuthService;
    private final SlackApiClient slackApiClient;
    private final ChecklistService checklistService;
    private final InboxFeatureService inboxFeatureService;
    private final TaskRepository taskRepository;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    // ==================== 1단계: 멘션 → 태스크 선택 프롬프트 ====================

    @Transactional
    public void handleAppMention(Map<String, Object> event, Map<String, Object> payload) {
        // 봇이 쓴 메시지(자기 자신 포함)는 무시 — 봇끼리 되받아치는 루프 방지
        if (event.get("bot_id") != null || event.get("user") == null) {
            return;
        }

        String teamId = payload.get("team_id") != null
                ? String.valueOf(payload.get("team_id"))
                : String.valueOf(event.get("team"));
        String channelId = String.valueOf(event.get("channel"));
        // 스레드 안에서 멘션됐으면 그 스레드에, 아니면 원 메시지에 스레드로 답한다
        String threadTs = event.get("thread_ts") != null
                ? String.valueOf(event.get("thread_ts"))
                : String.valueOf(event.get("ts"));

        List<SlackInstallation> boardInstallations = installationRepository.findActiveByTeamId(teamId).stream()
                .filter(si -> si.getBoard() != null)
                .toList();
        if (boardInstallations.isEmpty()) {
            log.info("Slack app_mention ignored: no active board installation for team {}", teamId);
            return;
        }

        SlackInstallation installation = resolveInstallation(boardInstallations, channelId);
        // 어느 설치든 같은 워크스페이스 봇 토큰이므로 안내 답장에는 첫 설치 토큰을 쓴다
        String botToken = slackOAuthService.decryptBotToken(
                installation != null ? installation : boardInstallations.get(0));

        if (installation == null) {
            replyText(botToken, channelId, threadTs,
                    "이 채널이 어느 보드의 채널인지 알 수 없어요. :thinking_face:\n"
                            + "보드 설정 → Slack 연동에서 이 채널을 기본 채널로 지정하면 멘션으로 체크리스트를 만들 수 있어요.");
            return;
        }

        String title = extractTitle(String.valueOf(event.get("text")));
        if (title.isBlank()) {
            replyText(botToken, channelId, threadTs,
                    "멘션과 함께 할 일 내용을 적으면 체크리스트에 추가돼요. :memo: (예: `@MILKYWAY 유닛 스냅핑 개선`)");
            return;
        }
        if (title.length() > TITLE_MAX_LENGTH) {
            title = title.substring(0, TITLE_MAX_LENGTH);
        }

        String boardId = installation.getBoard().getId();
        List<Map<String, Object>> blocks = List.of(
                section(":memo: 어느 태스크의 체크리스트에 추가할까요?\n> " + title),
                Map.of("type", "actions",
                        "block_id", BLOCK_ID_PREFIX + boardId,
                        "elements", List.of(
                                Map.of("type", "external_select",
                                        "action_id", ACTION_TASK_SELECT,
                                        "placeholder", Map.of("type", "plain_text", "text", "태스크 검색"),
                                        "min_query_length", 0),
                                Map.of("type", "button",
                                        "action_id", ACTION_ADD_INBOX,
                                        "text", Map.of("type", "plain_text", "text", "미분류에 바로 추가"),
                                        "value", boardId))));
        Map<String, Object> metadata = Map.of(
                "event_type", METADATA_EVENT_TYPE,
                "event_payload", Map.of("title", title, "board_id", boardId));

        try {
            slackApiClient.postThreadReply(botToken, channelId, threadTs, blocks, metadata);
        } catch (Exception e) {
            log.warn("Failed to post Slack checklist prompt to channel {}: {}", channelId, e.getMessage());
        }
    }

    // ==================== 2단계: 셀렉트 타이핑 → 태스크 검색 ====================

    /**
     * {@code block_suggestion} 응답. 검색어가 비어 있으면 최근 수정된 태스크 10개를 보여준다.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> suggestTasks(String blockId, String query) {
        if (blockId == null || !blockId.startsWith(BLOCK_ID_PREFIX)) {
            return Map.of("options", List.of());
        }
        String boardId = blockId.substring(BLOCK_ID_PREFIX.length());

        List<Task> tasks = (query == null || query.isBlank())
                ? taskRepository.findTop10ByBoardIdOrderByUpdatedAtDesc(boardId)
                : taskRepository.findByBoardIdAndTitleContainingIgnoreCase(boardId, query.trim());

        List<Map<String, Object>> options = new ArrayList<>();
        for (Task task : tasks) {
            if (options.size() >= MAX_SUGGESTIONS) break;
            options.add(Map.of(
                    "text", Map.of("type", "plain_text", "text", truncate(task.getTitle(), OPTION_TEXT_MAX_LENGTH)),
                    "value", task.getId()));
        }
        return Map.of("options", options);
    }

    // ==================== 3단계: 선택/버튼 → 항목 생성 ====================

    /**
     * {@code block_actions} 처리. 태스크 셀렉트 선택 또는 "미분류에 바로 추가" 클릭이면
     * 항목을 생성하고 프롬프트 메시지를 결과 메시지로 갈아끼운다.
     * <p>
     * REQUIRES_NEW: 생성 실패 롤백이 호출측(인터랙션 핸들러) 트랜잭션을 rollback-only로
     * 만들어 슬랙에 500이 나가는 것을 막는다 — 여기서 실패해도 바깥은 200 OK로 응답한다.
     */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    @SuppressWarnings("unchecked")
    public void handleBlockAction(String actionId, Map<String, Object> action, Map<String, Object> payload) {
        Map<String, Object> message = (Map<String, Object>) payload.get("message");
        String responseUrl = String.valueOf(payload.get("response_url"));
        Map<String, Object> user = (Map<String, Object>) payload.get("user");
        String slackUserId = user != null ? String.valueOf(user.get("id")) : null;

        PromptContext context = extractPromptContext(action, message);
        if (context == null || slackUserId == null) {
            log.warn("Slack checklist action {} missing prompt context, ignoring", actionId);
            return;
        }

        String taskId = null; // null이면 미분류(인박스) 태스크
        if (ACTION_TASK_SELECT.equals(actionId)) {
            Map<String, Object> selected = (Map<String, Object>) action.get("selected_option");
            if (selected == null) return;
            taskId = String.valueOf(selected.get("value"));
        }

        try {
            createAndRespond(context.boardId(), taskId, slackUserId, context.title(), responseUrl);
        } catch (Exception e) {
            log.warn("Failed to create checklist from Slack interaction: board={} task={} error={}",
                    context.boardId(), taskId, e.getMessage());
            respondEphemeral(responseUrl, "체크리스트 추가에 실패했어요. 잠시 후 다시 시도해 주세요. :pensive:");
            throw e; // 부분 커밋(인박스 태스크만 생성 등)을 남기지 않는다
        }
    }

    private void createAndRespond(String boardId, String taskIdOrNull, String slackUserId,
                                  String title, String responseUrl) {
        SlackInstallation installation = installationRepository.findActiveByBoardId(boardId)
                .orElse(null);
        if (installation == null) {
            respondEphemeral(responseUrl, "이 보드의 Slack 연동이 해제되어 있어요.");
            return;
        }

        SlackUserLink link = userLinkRepository.findBySlackUserId(slackUserId).orElse(null);
        User creator;
        String assigneeId = null;
        boolean actingAsInstaller;
        if (link != null && boardMemberRepository.existsByBoardIdAndUserId(boardId, link.getUser().getId())) {
            creator = link.getUser();
            assigneeId = creator.getId();
            actingAsInstaller = false;
        } else {
            creator = installation.getInstalledBy();
            actingAsInstaller = true;
        }

        Task task = taskIdOrNull != null
                ? taskRepository.findById(taskIdOrNull).orElse(null)
                : inboxFeatureService.getOrCreateInboxTask(boardId, creator.getId());
        if (task == null || !task.getBoard().getId().equals(boardId)) {
            respondEphemeral(responseUrl, "태스크를 찾을 수 없어요. 다시 선택해 주세요.");
            return;
        }

        checklistService.createChecklistItem(boardId, task.getId(), creator.getId(),
                ChecklistRequest.Create.of(title, assigneeId), null);

        Board board = task.getBoard();
        String boardUrl = frontendUrl.replaceAll("/+$", "") + "/boards/" + boardId + "?task=" + task.getId();
        StringBuilder text = new StringBuilder();
        text.append(":white_check_mark: *").append(board.getName()).append("* 보드의 *")
                .append(task.getTitle()).append("* 태스크에 추가했어요\n")
                .append("> ").append(title).append("\n")
                .append("<").append(boardUrl).append("|보드에서 보기>");
        if (actingAsInstaller) {
            text.append("\n_슬랙 계정이 BRIDGE와 연결돼 있지 않거나 보드 멤버가 아니라서 담당자 없이 추가했어요._");
        }

        // 프롬프트 메시지를 결과로 교체 — 셀렉트/버튼을 없애 중복 추가를 막는다
        try {
            slackApiClient.postToResponseUrl(responseUrl, Map.of(
                    "replace_original", true,
                    "blocks", List.of(section(text.toString())),
                    "text", "체크리스트에 추가했어요: " + title));
        } catch (Exception e) {
            log.warn("Failed to replace Slack prompt via response_url: {}", e.getMessage());
        }

        log.info("Checklist item created from Slack: board={} task={} by slackUser={}",
                boardId, task.getId(), slackUserId);
    }

    // ==================== 헬퍼 ====================

    private record PromptContext(String boardId, String title) {}

    /**
     * 프롬프트 메시지에서 제목/보드를 복원한다. metadata가 정석이고,
     * 유실 시 프롬프트 본문의 인용줄({@code > 제목})과 block_id/버튼 value에서 복구한다.
     */
    @SuppressWarnings("unchecked")
    private PromptContext extractPromptContext(Map<String, Object> action, Map<String, Object> message) {
        String boardId = null;
        String title = null;

        if (message != null && message.get("metadata") instanceof Map<?, ?> metadata
                && metadata.get("event_payload") instanceof Map<?, ?> eventPayload) {
            Object b = eventPayload.get("board_id");
            Object t = eventPayload.get("title");
            if (b != null) boardId = String.valueOf(b);
            if (t != null) title = String.valueOf(t);
        }

        if (boardId == null) {
            String blockId = String.valueOf(action.get("block_id"));
            if (blockId.startsWith(BLOCK_ID_PREFIX)) {
                boardId = blockId.substring(BLOCK_ID_PREFIX.length());
            } else if (ACTION_ADD_INBOX.equals(String.valueOf(action.get("action_id"))) && action.get("value") != null) {
                boardId = String.valueOf(action.get("value"));
            }
        }

        if (title == null && message != null && message.get("blocks") instanceof List<?> blocks) {
            for (Object blockObj : blocks) {
                if (!(blockObj instanceof Map<?, ?> block)) continue;
                if (!(block.get("text") instanceof Map<?, ?> textMap)) continue;
                String text = String.valueOf(textMap.get("text"));
                int quoteIdx = text.indexOf("\n> ");
                if (quoteIdx >= 0) {
                    title = text.substring(quoteIdx + 3).trim();
                    break;
                }
            }
        }

        if (boardId == null || title == null || title.isBlank()) {
            return null;
        }
        return new PromptContext(boardId, title);
    }

    /** ① 기본 채널 일치 → ② 유일한 보드 설치 → ③ 결정 불가(null) */
    private SlackInstallation resolveInstallation(List<SlackInstallation> installations, String channelId) {
        for (SlackInstallation si : installations) {
            if (Objects.equals(si.getDefaultChannelId(), channelId)) {
                return si;
            }
        }
        return installations.size() == 1 ? installations.get(0) : null;
    }

    /**
     * 멘션 원문에서 항목 제목을 뽑는다. {@code <@U123>} 형태의 멘션 토큰을 걷어내고
     * 슬랙 이스케이프를 되돌린 뒤 공백을 정리한다.
     */
    private String extractTitle(String rawText) {
        if (rawText == null || "null".equals(rawText)) return "";
        String text = rawText.replaceAll("<@[^>]+>", " ");
        text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
        return text.replaceAll("\\s+", " ").trim();
    }

    private String truncate(String text, int maxLength) {
        if (text == null) return "";
        return text.length() > maxLength ? text.substring(0, maxLength - 1) + "…" : text;
    }

    private Map<String, Object> section(String mrkdwnText) {
        return Map.of("type", "section",
                "text", Map.of("type", "mrkdwn", "text", mrkdwnText));
    }

    /** 실패해도 원 흐름에 영향을 주지 않는 안내 답장 */
    private void replyText(String botToken, String channelId, String threadTs, String text) {
        try {
            slackApiClient.postThreadReply(botToken, channelId, threadTs, List.of(section(text)));
        } catch (Exception e) {
            log.warn("Failed to post Slack thread reply to channel {}: {}", channelId, e.getMessage());
        }
    }

    private void respondEphemeral(String responseUrl, String text) {
        try {
            slackApiClient.postToResponseUrl(responseUrl, Map.of(
                    "response_type", "ephemeral",
                    "replace_original", false,
                    "text", text));
        } catch (Exception e) {
            log.warn("Failed to post ephemeral response via response_url: {}", e.getMessage());
        }
    }
}
