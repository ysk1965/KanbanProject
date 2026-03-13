package com.kanban.domain.integration.slack.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.note.NoteComment;
import com.kanban.domain.integration.slack.MemberSlackWebhook;
import com.kanban.domain.integration.slack.MemberSlackWebhookRepository;
import com.kanban.domain.integration.slack.SlackInstallation;
import com.kanban.domain.notification.NotificationPreference;
import com.kanban.domain.notification.NotificationPreferenceRepository;
import com.kanban.domain.notification.NotificationType;
import com.kanban.domain.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SlackNotificationService {

    private final MemberSlackWebhookRepository webhookRepository;
    private final NotificationPreferenceRepository preferenceRepository;
    private final RestTemplate restTemplate;
    private final SlackOAuthService slackOAuthService;
    private final SlackBotNotificationService botNotificationService;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    private String getButtonLabel() {
        return "보드에서 보기";
    }

    private String resolveFrontendUrl(String originUrl) {
        return (originUrl != null && !originUrl.isBlank()) ? originUrl.replaceAll("/+$", "") : frontendUrl;
    }

    @Async
    @Transactional(readOnly = true)
    public void sendMentionNotifications(Comment comment, User sender, Board board, String originUrl) {
        if (!board.canAccessSlack()) {
            return;
        }
        if (comment.getMentions() == null || comment.getMentions().isEmpty()) {
            return;
        }

        List<String> mentionedUserIds = Arrays.stream(comment.getMentions().split(","))
                .map(String::trim)
                .filter(id -> !id.equals(sender.getId()))
                .toList();

        if (mentionedUserIds.isEmpty()) {
            return;
        }

        List<String> filteredUserIds = filterBySlackPreference(board.getId(), mentionedUserIds, NotificationType.COMMENT_MENTION);
        if (filteredUserIds.isEmpty()) {
            return;
        }

        // Try Bot API first (DM to linked users + channel fallback)
        boolean sentViaBot = trySendViaBotWithDm(board, filteredUserIds,
                installation -> botNotificationService.sendMentionNotification(comment, sender, board, installation, originUrl),
                (userIds, installation) -> {
                    String resolvedUrl = resolveFrontendUrl(originUrl);
                    Map<String, Object> payload = buildMentionPayload(comment, sender, board, resolvedUrl);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> blocks = (List<Map<String, Object>>) payload.get("blocks");
                    return botNotificationService.sendDmToLinkedUsers(userIds, installation, blocks, "COMMENT_MENTION", board.getId());
                });

        // Fallback to individual webhooks
        if (!sentViaBot) {
            List<MemberSlackWebhook> webhooks = webhookRepository
                    .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), filteredUserIds);
            if (!webhooks.isEmpty()) {
                String resolvedUrl = resolveFrontendUrl(originUrl);
                Map<String, Object> payload = buildMentionPayload(comment, sender, board, resolvedUrl);
                sendToWebhooks(webhooks, payload, board.getId());
            }
        }
    }

    @Async
    @Transactional(readOnly = true)
    public void sendChecklistAssignedNotification(ChecklistItem item, User assigner, Board board, String originUrl) {
        if (!board.canAccessSlack()) {
            return;
        }
        User assignee = item.getAssignee();
        if (assignee == null || assignee.getId().equals(assigner.getId())) {
            return;
        }

        List<String> filteredUserIds = filterBySlackPreference(board.getId(),
                List.of(assignee.getId()), NotificationType.CHECKLIST_ASSIGNED);
        if (filteredUserIds.isEmpty()) {
            return;
        }

        // Try Bot API first (DM + channel)
        boolean sentViaBot = trySendViaBotWithDm(board, filteredUserIds,
                installation -> botNotificationService.sendChecklistAssignedNotification(item, assigner, board, installation, originUrl),
                (userIds, installation) -> {
                    String resolvedUrl = resolveFrontendUrl(originUrl);
                    Map<String, Object> payload = buildChecklistAssignedPayload(item, assigner, board, resolvedUrl);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> blocks = (List<Map<String, Object>>) payload.get("blocks");
                    return botNotificationService.sendDmToLinkedUsers(userIds, installation, blocks, "CHECKLIST_ASSIGNED", board.getId());
                });

        // Fallback to individual webhooks
        if (!sentViaBot) {
            List<MemberSlackWebhook> webhooks = webhookRepository
                    .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), filteredUserIds);
            if (!webhooks.isEmpty()) {
                String resolvedUrl = resolveFrontendUrl(originUrl);
                Map<String, Object> payload = buildChecklistAssignedPayload(item, assigner, board, resolvedUrl);
                sendToWebhooks(webhooks, payload, board.getId());
            }
        }
    }

    @Async
    @Transactional(readOnly = true)
    public void sendTaskCommentNotifications(Comment comment, User sender, Board board,
                                              List<String> recipientUserIds, Set<String> excludeUserIds, String originUrl) {
        if (!board.canAccessSlack()) {
            return;
        }
        List<String> targetUserIds = recipientUserIds.stream()
                .filter(id -> !id.equals(sender.getId()))
                .filter(id -> !excludeUserIds.contains(id))
                .toList();

        if (targetUserIds.isEmpty()) {
            return;
        }

        List<String> filteredUserIds = filterBySlackPreference(board.getId(), targetUserIds, NotificationType.TASK_COMMENT);
        if (filteredUserIds.isEmpty()) {
            return;
        }

        // Try Bot API first (DM + channel)
        boolean sentViaBot = trySendViaBotWithDm(board, filteredUserIds,
                installation -> botNotificationService.sendTaskCommentNotification(comment, sender, board, installation, originUrl),
                (userIds, installation) -> {
                    String resolvedUrl = resolveFrontendUrl(originUrl);
                    Map<String, Object> payload = buildTaskCommentPayload(comment, sender, board, resolvedUrl);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> blocks = (List<Map<String, Object>>) payload.get("blocks");
                    return botNotificationService.sendDmToLinkedUsers(userIds, installation, blocks, "TASK_COMMENT", board.getId());
                });

        // Fallback to individual webhooks
        if (!sentViaBot) {
            List<MemberSlackWebhook> webhooks = webhookRepository
                    .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), filteredUserIds);
            if (!webhooks.isEmpty()) {
                String resolvedUrl = resolveFrontendUrl(originUrl);
                Map<String, Object> payload = buildTaskCommentPayload(comment, sender, board, resolvedUrl);
                sendToWebhooks(webhooks, payload, board.getId());
            }
        }
    }

    @Async
    @Transactional(readOnly = true)
    public void sendMeetingMemoNotifications(Meeting meeting, User sender, Board board, List<String> participantIds, String originUrl) {
        if (!board.canAccessSlack()) {
            return;
        }
        if (participantIds.isEmpty()) {
            return;
        }

        List<String> filteredUserIds = filterBySlackPreference(board.getId(), participantIds, NotificationType.MEETING_MEMO_SHARED);
        if (filteredUserIds.isEmpty()) {
            return;
        }

        // Try Bot API first (DM + channel)
        boolean sentViaBot = trySendViaBotWithDm(board, filteredUserIds,
                installation -> botNotificationService.sendMeetingMemoNotification(meeting, sender, board, installation, originUrl),
                (userIds, installation) -> {
                    String resolvedUrl = resolveFrontendUrl(originUrl);
                    Map<String, Object> payload = buildMeetingMemoPayload(meeting, sender, board, resolvedUrl);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> blocks = (List<Map<String, Object>>) payload.get("blocks");
                    return botNotificationService.sendDmToLinkedUsers(userIds, installation, blocks, "MEETING_MEMO_SHARED", board.getId());
                });

        // Fallback to individual webhooks
        if (!sentViaBot) {
            List<MemberSlackWebhook> webhooks = webhookRepository
                    .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), filteredUserIds);
            if (!webhooks.isEmpty()) {
                String resolvedUrl = resolveFrontendUrl(originUrl);
                Map<String, Object> payload = buildMeetingMemoPayload(meeting, sender, board, resolvedUrl);
                sendToWebhooks(webhooks, payload, board.getId());
            }
        }
    }

    @Async
    @Transactional(readOnly = true)
    public void sendNoteCommentMentionNotifications(NoteComment noteComment, User sender, Board board, String originUrl) {
        if (!board.canAccessSlack()) {
            return;
        }
        if (noteComment.getMentions() == null || noteComment.getMentions().isEmpty()) {
            return;
        }

        List<String> mentionedUserIds = Arrays.stream(noteComment.getMentions().split(","))
                .map(String::trim)
                .filter(id -> !id.equals(sender.getId()))
                .toList();

        if (mentionedUserIds.isEmpty()) {
            return;
        }

        List<String> filteredUserIds = filterBySlackPreference(board.getId(), mentionedUserIds, NotificationType.NOTE_COMMENT_MENTION);
        if (filteredUserIds.isEmpty()) {
            return;
        }

        // Try Bot API first (DM + channel)
        boolean sentViaBot = trySendViaBotWithDm(board, filteredUserIds,
                installation -> botNotificationService.sendNoteCommentMentionNotification(noteComment, sender, board, installation, originUrl),
                (userIds, installation) -> {
                    String resolvedUrl = resolveFrontendUrl(originUrl);
                    Map<String, Object> payload = buildNoteCommentMentionPayload(noteComment, sender, board, resolvedUrl);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> blocks = (List<Map<String, Object>>) payload.get("blocks");
                    return botNotificationService.sendDmToLinkedUsers(userIds, installation, blocks, "NOTE_COMMENT_MENTION", board.getId());
                });

        // Fallback to individual webhooks
        if (!sentViaBot) {
            List<MemberSlackWebhook> webhooks = webhookRepository
                    .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), filteredUserIds);
            if (!webhooks.isEmpty()) {
                String resolvedUrl = resolveFrontendUrl(originUrl);
                Map<String, Object> payload = buildNoteCommentMentionPayload(noteComment, sender, board, resolvedUrl);
                sendToWebhooks(webhooks, payload, board.getId());
            }
        }
    }

    private Map<String, Object> buildNoteCommentMentionPayload(NoteComment noteComment, User sender, Board board, String resolvedUrl) {
        String noteTitle = noteComment.getNote().getTitle();
        String commentContent = noteComment.getContent();
        if (commentContent != null && commentContent.length() > 200) {
            commentContent = commentContent.substring(0, 200) + "...";
        }

        String boardUrl = resolvedUrl + "/boards/" + board.getId() + "?view=notes";

        List<Map<String, Object>> blocks = new ArrayList<>();

        blocks.add(Map.of("type", "header",
                "text", Map.of("type", "plain_text", "text", "\uD83D\uDCDD 노트 댓글 멘션", "emoji", true)));

        blocks.add(Map.of("type", "section",
                "fields", List.of(
                        Map.of("type", "mrkdwn", "text", "*Board:*\n" + board.getName()),
                        Map.of("type", "mrkdwn", "text", "*Note:*\n" + noteTitle),
                        Map.of("type", "mrkdwn", "text", "*Author:*\n" + sender.getName())
                )));

        if (commentContent != null && !commentContent.isBlank()) {
            blocks.add(Map.of("type", "section",
                    "text", Map.of("type", "mrkdwn", "text", "> " + commentContent)));
        }

        blocks.add(Map.of("type", "actions",
                "elements", List.of(
                        Map.of("type", "button",
                                "text", Map.of("type", "plain_text", "text", getButtonLabel()),
                                "url", boardUrl)
                )));

        return Map.of("blocks", blocks);
    }

    /**
     * Try to send notification via Slack App Bot.
     * 1) DM to individually linked users
     * 2) Channel message for remaining users
     * Returns true if Bot installation exists (even if no DMs sent).
     */
    private boolean trySendViaBotWithDm(Board board, List<String> targetUserIds,
                                         java.util.function.Consumer<SlackInstallation> channelSender,
                                         java.util.function.BiFunction<List<String>, SlackInstallation, Set<String>> dmSender) {
        try {
            Optional<SlackInstallation> installation = slackOAuthService.findActiveInstallation(board);
            if (installation.isEmpty()) return false;

            SlackInstallation inst = installation.get();

            // 1) Send DMs to linked users
            Set<String> dmSentUserIds = dmSender.apply(targetUserIds, inst);

            // 2) Send channel message for remaining users (if channel configured)
            if (inst.getDefaultChannelId() != null) {
                channelSender.accept(inst);
            }

            return true;
        } catch (Exception e) {
            log.warn("Failed to send via Slack Bot for board {}, falling back to webhooks: {}",
                    board.getId(), e.getMessage());
        }
        return false;
    }

    /**
     * Try to send notification via Slack App Bot (channel only, no DM targeting).
     */
    private boolean trySendViaBot(Board board, java.util.function.Consumer<SlackInstallation> sender) {
        try {
            Optional<SlackInstallation> installation = slackOAuthService.findActiveInstallation(board);
            if (installation.isPresent() && installation.get().getDefaultChannelId() != null) {
                sender.accept(installation.get());
                return true;
            }
        } catch (Exception e) {
            log.warn("Failed to send via Slack Bot for board {}, falling back to webhooks: {}",
                    board.getId(), e.getMessage());
        }
        return false;
    }

    private void sendToWebhooks(List<MemberSlackWebhook> webhooks, Map<String, Object> payload, String boardId) {
        for (MemberSlackWebhook webhook : webhooks) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);

                restTemplate.postForEntity(webhook.getWebhookUrl(), entity, String.class);
                log.info("Slack notification sent to user {} on board {}",
                        webhook.getUser().getId(), boardId);
            } catch (Exception e) {
                log.warn("Failed to send Slack notification to user {} on board {}: {}",
                        webhook.getUser().getId(), boardId, e.getMessage());
            }
        }
    }

    private List<String> filterBySlackPreference(String boardId, List<String> userIds, NotificationType type) {
        Map<String, NotificationPreference> prefs = preferenceRepository
                .findByBoardIdAndUserIdIn(boardId, userIds).stream()
                .collect(java.util.stream.Collectors.toMap(p -> p.getUser().getId(), p -> p));

        return userIds.stream()
                .filter(userId -> {
                    NotificationPreference pref = prefs.get(userId);
                    return pref == null || pref.isSlackEnabled(type);
                })
                .toList();
    }

    private Map<String, Object> buildMentionPayload(Comment comment, User sender, Board board, String resolvedUrl) {
        String taskTitle = comment.getTask() != null ? comment.getTask().getTitle() : "Unknown Task";
        String commentContent = comment.getContent();
        if (commentContent != null && commentContent.length() > 200) {
            commentContent = commentContent.substring(0, 200) + "...";
        }

        String taskId = comment.getTask() != null ? comment.getTask().getId() : null;
        String boardUrl = resolvedUrl + "/boards/" + board.getId() + (taskId != null ? "?task=" + taskId : "");

        List<Map<String, Object>> blocks = new ArrayList<>();

        // Header
        blocks.add(Map.of("type", "header",
                "text", Map.of("type", "plain_text", "text", "\uD83D\uDCAC @멘션 알림", "emoji", true)));

        // Info fields
        blocks.add(Map.of("type", "section",
                "fields", List.of(
                        Map.of("type", "mrkdwn", "text", "*Board:*\n" + board.getName()),
                        Map.of("type", "mrkdwn", "text", "*Task:*\n" + taskTitle),
                        Map.of("type", "mrkdwn", "text", "*Author:*\n" + sender.getName())
                )));

        // Comment content
        if (commentContent != null && !commentContent.isBlank()) {
            blocks.add(Map.of("type", "section",
                    "text", Map.of("type", "mrkdwn", "text", "> " + commentContent)));
        }

        // Action button
        blocks.add(Map.of("type", "actions",
                "elements", List.of(
                        Map.of("type", "button",
                                "text", Map.of("type", "plain_text", "text", getButtonLabel()),
                                "url", boardUrl)
                )));

        return Map.of("blocks", blocks);
    }

    private Map<String, Object> buildChecklistAssignedPayload(ChecklistItem item, User assigner, Board board, String resolvedUrl) {
        String taskTitle = item.getTask() != null ? item.getTask().getTitle() : "Unknown Task";
        String taskId = item.getTask() != null ? item.getTask().getId() : null;
        String boardUrl = resolvedUrl + "/boards/" + board.getId() + (taskId != null ? "?task=" + taskId : "");

        List<Map<String, Object>> blocks = new ArrayList<>();

        blocks.add(Map.of("type", "header",
                "text", Map.of("type", "plain_text", "text", "\uD83D\uDCCB 체크리스트 배정 알림", "emoji", true)));

        blocks.add(Map.of("type", "section",
                "fields", List.of(
                        Map.of("type", "mrkdwn", "text", "*Board:*\n" + board.getName()),
                        Map.of("type", "mrkdwn", "text", "*Task:*\n" + taskTitle),
                        Map.of("type", "mrkdwn", "text", "*\uBC30\uC815\uC790:*\n" + assigner.getName()),
                        Map.of("type", "mrkdwn", "text", "*\uCCB4\uD06C\uB9AC\uC2A4\uD2B8:*\n" + item.getTitle())
                )));

        blocks.add(Map.of("type", "actions",
                "elements", List.of(
                        Map.of("type", "button",
                                "text", Map.of("type", "plain_text", "text", getButtonLabel()),
                                "url", boardUrl)
                )));

        return Map.of("blocks", blocks);
    }

    private Map<String, Object> buildMeetingMemoPayload(Meeting meeting, User sender, Board board, String resolvedUrl) {
        String boardUrl = resolvedUrl + "/boards/" + board.getId() + "?view=schedule&tab=meeting";
        String memoPreview = meeting.getMemo();
        if (memoPreview != null && memoPreview.length() > 200) {
            memoPreview = memoPreview.substring(0, 200) + "...";
        }

        List<Map<String, Object>> blocks = new ArrayList<>();

        blocks.add(Map.of("type", "header",
                "text", Map.of("type", "plain_text", "text", "\uD83D\uDCCB 회의록 공유", "emoji", true)));

        blocks.add(Map.of("type", "section",
                "fields", List.of(
                        Map.of("type", "mrkdwn", "text", "*Board:*\n" + board.getName()),
                        Map.of("type", "mrkdwn", "text", "*회의:*\n" + meeting.getTitle()),
                        Map.of("type", "mrkdwn", "text", "*공유자:*\n" + sender.getName())
                )));

        if (memoPreview != null && !memoPreview.isBlank()) {
            blocks.add(Map.of("type", "section",
                    "text", Map.of("type", "mrkdwn", "text", "> " + memoPreview)));
        }

        blocks.add(Map.of("type", "actions",
                "elements", List.of(
                        Map.of("type", "button",
                                "text", Map.of("type", "plain_text", "text", getButtonLabel()),
                                "url", boardUrl)
                )));

        return Map.of("blocks", blocks);
    }

    private Map<String, Object> buildTaskCommentPayload(Comment comment, User sender, Board board, String resolvedUrl) {
        String taskTitle = comment.getTask() != null ? comment.getTask().getTitle() : "Unknown Task";
        String commentContent = comment.getContent();
        if (commentContent != null && commentContent.length() > 200) {
            commentContent = commentContent.substring(0, 200) + "...";
        }

        String taskId = comment.getTask() != null ? comment.getTask().getId() : null;
        String boardUrl = resolvedUrl + "/boards/" + board.getId() + (taskId != null ? "?task=" + taskId : "");

        List<Map<String, Object>> blocks = new ArrayList<>();

        blocks.add(Map.of("type", "header",
                "text", Map.of("type", "plain_text", "text", "\uD83D\uDCAC 새 댓글 알림", "emoji", true)));

        blocks.add(Map.of("type", "section",
                "fields", List.of(
                        Map.of("type", "mrkdwn", "text", "*Board:*\n" + board.getName()),
                        Map.of("type", "mrkdwn", "text", "*Task:*\n" + taskTitle),
                        Map.of("type", "mrkdwn", "text", "*작성자:*\n" + sender.getName())
                )));

        if (commentContent != null && !commentContent.isBlank()) {
            blocks.add(Map.of("type", "section",
                    "text", Map.of("type", "mrkdwn", "text", "> " + commentContent)));
        }

        blocks.add(Map.of("type", "actions",
                "elements", List.of(
                        Map.of("type", "button",
                                "text", Map.of("type", "plain_text", "text", getButtonLabel()),
                                "url", boardUrl)
                )));

        return Map.of("blocks", blocks);
    }
}
