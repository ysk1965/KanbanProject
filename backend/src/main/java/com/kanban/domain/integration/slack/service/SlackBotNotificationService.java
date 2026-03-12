package com.kanban.domain.integration.slack.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.integration.BrandResolver;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.integration.slack.SlackInstallation;
import com.kanban.domain.integration.slack.SlackUserLink;
import com.kanban.domain.integration.slack.SlackUserLinkRepository;
import com.kanban.domain.integration.slack.dto.SlackAppResponse;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.note.NoteComment;
import com.kanban.domain.user.User;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class SlackBotNotificationService {

    private final SlackApiClient slackApiClient;
    private final SlackOAuthService slackOAuthService;
    private final SlackUserLinkRepository userLinkRepository;
    private final BoardRepository boardRepository;

    @Value("${app.frontend-url:https://bridgespots.com}")
    private String frontendUrl;

    /**
     * Send mention notification via Bot
     */
    public void sendMentionNotification(Comment comment, User sender, Board board,
                                         SlackInstallation installation, String originUrl) {
        String channelId = installation.getDefaultChannelId();
        if (channelId == null) return;

        String taskTitle = comment.getTask() != null ? comment.getTask().getTitle() : "Unknown Task";
        String commentContent = truncate(comment.getContent(), 200);
        String boardUrl = resolveUrl(originUrl) + "/boards/" + board.getId();

        List<Map<String, Object>> blocks = new ArrayList<>();
        blocks.add(header("\uD83D\uDCAC @멘션 알림"));
        blocks.add(fields(
                "*Board:*\n" + board.getName(),
                "*Task:*\n" + taskTitle,
                "*Author:*\n" + sender.getName()
        ));
        if (commentContent != null && !commentContent.isBlank()) {
            blocks.add(section("> " + commentContent));
        }
        blocks.add(actions(boardUrl, "bridge_view_board"));

        sendMessage(installation, channelId, blocks, "COMMENT_MENTION", comment.getId(), board.getId());
    }

    /**
     * Send checklist assigned notification via Bot
     */
    public void sendChecklistAssignedNotification(ChecklistItem item, User assigner, Board board,
                                                    SlackInstallation installation, String originUrl) {
        String channelId = installation.getDefaultChannelId();
        if (channelId == null) return;

        String taskTitle = item.getTask() != null ? item.getTask().getTitle() : "Unknown Task";
        String boardUrl = resolveUrl(originUrl) + "/boards/" + board.getId();

        List<Map<String, Object>> blocks = new ArrayList<>();
        blocks.add(header("\uD83D\uDCCB 체크리스트 배정 알림"));
        blocks.add(fields(
                "*Board:*\n" + board.getName(),
                "*Task:*\n" + taskTitle,
                "*배정자:*\n" + assigner.getName(),
                "*체크리스트:*\n" + item.getTitle()
        ));
        blocks.add(actionsWithComplete(boardUrl, "checklist:" + item.getId() + ":" + board.getId()));

        sendMessage(installation, channelId, blocks, "CHECKLIST_ASSIGNED", item.getId(), board.getId());
    }

    /**
     * Send task comment notification via Bot
     */
    public void sendTaskCommentNotification(Comment comment, User sender, Board board,
                                             SlackInstallation installation, String originUrl) {
        String channelId = installation.getDefaultChannelId();
        if (channelId == null) return;

        String taskTitle = comment.getTask() != null ? comment.getTask().getTitle() : "Unknown Task";
        String commentContent = truncate(comment.getContent(), 200);
        String boardUrl = resolveUrl(originUrl) + "/boards/" + board.getId();

        List<Map<String, Object>> blocks = new ArrayList<>();
        blocks.add(header("\uD83D\uDCAC 새 댓글 알림"));
        blocks.add(fields(
                "*Board:*\n" + board.getName(),
                "*Task:*\n" + taskTitle,
                "*작성자:*\n" + sender.getName()
        ));
        if (commentContent != null && !commentContent.isBlank()) {
            blocks.add(section("> " + commentContent));
        }
        blocks.add(actions(boardUrl, "bridge_view_board"));

        sendMessage(installation, channelId, blocks, "TASK_COMMENT", comment.getId(), board.getId());
    }

    /**
     * Send meeting memo notification via Bot
     */
    public void sendMeetingMemoNotification(Meeting meeting, User sender, Board board,
                                             SlackInstallation installation, String originUrl) {
        String channelId = installation.getDefaultChannelId();
        if (channelId == null) return;

        String memoPreview = truncate(meeting.getMemo(), 200);
        String boardUrl = resolveUrl(originUrl) + "/boards/" + board.getId() + "?view=schedule&tab=meeting";

        List<Map<String, Object>> blocks = new ArrayList<>();
        blocks.add(header("\uD83D\uDCCB 회의록 공유"));
        blocks.add(fields(
                "*Board:*\n" + board.getName(),
                "*회의:*\n" + meeting.getTitle(),
                "*공유자:*\n" + sender.getName()
        ));
        if (memoPreview != null && !memoPreview.isBlank()) {
            blocks.add(section("> " + memoPreview));
        }
        blocks.add(actions(boardUrl, "bridge_view_board"));

        sendMessage(installation, channelId, blocks, "MEETING_MEMO_SHARED", meeting.getId(), board.getId());
    }

    /**
     * Send note comment mention notification via Bot
     */
    public void sendNoteCommentMentionNotification(NoteComment noteComment, User sender, Board board,
                                                     SlackInstallation installation, String originUrl) {
        String channelId = installation.getDefaultChannelId();
        if (channelId == null) return;

        String noteTitle = noteComment.getNote().getTitle();
        String commentContent = truncate(noteComment.getContent(), 200);
        String boardUrl = resolveUrl(originUrl) + "/boards/" + board.getId() + "?view=notes";

        List<Map<String, Object>> blocks = new ArrayList<>();
        blocks.add(header("\uD83D\uDCDD 노트 댓글 멘션"));
        blocks.add(fields(
                "*Board:*\n" + board.getName(),
                "*Note:*\n" + noteTitle,
                "*Author:*\n" + sender.getName()
        ));
        if (commentContent != null && !commentContent.isBlank()) {
            blocks.add(section("> " + commentContent));
        }
        blocks.add(actions(boardUrl, "bridge_view_board"));

        sendMessage(installation, channelId, blocks, "NOTE_COMMENT_MENTION", noteComment.getId(), board.getId());
    }

    /**
     * Send test DM notification to the current user
     */
    public SlackAppResponse.TestResult testNotification(String boardId, String userId, String originUrl) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        SlackInstallation installation = slackOAuthService.findActiveInstallation(board)
                .orElseThrow(() -> new BusinessException(ErrorCode.SLACK_APP_NOT_INSTALLED));

        SlackUserLink userLink = userLinkRepository.findByUserId(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SLACK_USER_NOT_LINKED));

        try {
            String botToken = slackOAuthService.decryptBotToken(installation);

            String resolved = resolveUrl(originUrl);
            String brand = BrandResolver.resolve(resolved);
            List<Map<String, Object>> blocks = new ArrayList<>();
            blocks.add(header("\uD83D\uDD14 Test Notification"));
            blocks.add(section(brand + " Slack Bot 연동 테스트 메시지입니다."));
            blocks.add(fields(
                    "*Board:*\n" + board.getName(),
                    "*Time:*\n" + Instant.now().toString()
            ));
            String boardUrl = resolved + "/boards/" + boardId;
            blocks.add(actions(boardUrl, "bridge_test"));

            String dmChannelId = slackApiClient.conversationsOpen(botToken, userLink.getSlackUserId());
            slackApiClient.postMessage(botToken, dmChannelId, blocks);

            return SlackAppResponse.TestResult.builder()
                    .success(true)
                    .message("테스트 메시지가 전송되었습니다")
                    .build();
        } catch (Exception e) {
            log.warn("Slack test DM failed for user {}: {}", userId, e.getMessage());
            String detail = e.getMessage() != null ? e.getMessage() : "Unknown error";
            return SlackAppResponse.TestResult.builder()
                    .success(false)
                    .message("Slack DM 전송에 실패했습니다: " + detail)
                    .build();
        }
    }

    /**
     * Send DM notifications to individually linked Slack users.
     * Returns the set of user IDs that were successfully notified via DM.
     */
    public Set<String> sendDmToLinkedUsers(List<String> targetUserIds, SlackInstallation installation,
                                            List<Map<String, Object>> blocks, String entityType, String boardId) {
        Set<String> dmSentUserIds = new HashSet<>();
        if (targetUserIds.isEmpty()) return dmSentUserIds;

        List<SlackUserLink> userLinks = userLinkRepository.findByUserIdIn(targetUserIds);
        if (userLinks.isEmpty()) return dmSentUserIds;

        String botToken = slackOAuthService.decryptBotToken(installation);

        for (SlackUserLink link : userLinks) {
            try {
                // Open DM channel with user's Slack ID using the bot token
                String dmChannelId = slackApiClient.conversationsOpen(botToken, link.getSlackUserId());
                // Send message to DM channel
                slackApiClient.postMessage(botToken, dmChannelId, blocks);
                dmSentUserIds.add(link.getUser().getId());
                log.info("Slack DM sent to user {} (slack: {}) for {} on board {}",
                        link.getUser().getId(), link.getSlackUserId(), entityType, boardId);
            } catch (Exception e) {
                log.warn("Failed to send Slack DM to user {} (slack: {}): {}",
                        link.getUser().getId(), link.getSlackUserId(), e.getMessage());
            }
        }
        return dmSentUserIds;
    }

    // ---- Helper methods ----

    private void sendMessage(SlackInstallation installation, String channelId,
                              List<Map<String, Object>> blocks, String entityType, String entityId, String boardId) {
        try {
            String botToken = slackOAuthService.decryptBotToken(installation);
            Map<String, Object> metadata = Map.of(
                    "event_type", "bridge_notification",
                    "event_payload", Map.of(
                            "entity_type", entityType,
                            "entity_id", entityId,
                            "board_id", boardId
                    )
            );
            slackApiClient.postMessage(botToken, channelId, blocks, metadata);
            log.info("Slack Bot notification sent: type={} board={} channel={}", entityType, boardId, channelId);
        } catch (Exception e) {
            log.warn("Failed to send Slack Bot notification: type={} board={} error={}", entityType, boardId, e.getMessage());
        }
    }

    private String resolveUrl(String originUrl) {
        return (originUrl != null && !originUrl.isBlank()) ? originUrl.replaceAll("/+$", "") : frontendUrl;
    }

    private String truncate(String text, int maxLength) {
        if (text == null) return null;
        return text.length() > maxLength ? text.substring(0, maxLength) + "..." : text;
    }

    // ---- Block Kit builders ----

    private Map<String, Object> header(String text) {
        return Map.of("type", "header",
                "text", Map.of("type", "plain_text", "text", text, "emoji", true));
    }

    private Map<String, Object> fields(String... fieldTexts) {
        List<Map<String, Object>> fieldList = new ArrayList<>();
        for (String ft : fieldTexts) {
            fieldList.add(Map.of("type", "mrkdwn", "text", ft));
        }
        return Map.of("type", "section", "fields", fieldList);
    }

    private Map<String, Object> section(String text) {
        return Map.of("type", "section",
                "text", Map.of("type", "mrkdwn", "text", text));
    }

    private Map<String, Object> actions(String boardUrl, String actionId) {
        return Map.of("type", "actions",
                "elements", List.of(
                        Map.of("type", "button",
                                "text", Map.of("type", "plain_text", "text", "보드에서 보기"),
                                "url", boardUrl,
                                "action_id", actionId)
                ));
    }

    private Map<String, Object> actionsWithComplete(String boardUrl, String completeValue) {
        return Map.of("type", "actions",
                "elements", List.of(
                        Map.of("type", "button",
                                "text", Map.of("type", "plain_text", "text", "보드에서 보기"),
                                "url", boardUrl,
                                "action_id", "bridge_view_board"),
                        Map.of("type", "button",
                                "text", Map.of("type", "plain_text", "text", "✅ 완료"),
                                "style", "primary",
                                "action_id", "bridge_mark_complete",
                                "value", completeValue)
                ));
    }
}
