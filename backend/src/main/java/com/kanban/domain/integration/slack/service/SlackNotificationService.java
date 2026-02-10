package com.kanban.domain.integration.slack.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.integration.slack.MemberSlackWebhook;
import com.kanban.domain.integration.slack.MemberSlackWebhookRepository;
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
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class SlackNotificationService {

    private final MemberSlackWebhookRepository webhookRepository;
    private final NotificationPreferenceRepository preferenceRepository;
    private final RestTemplate restTemplate;

    @Value("${app.frontend-url:https://bridgespots.com}")
    private String frontendUrl;

    private String getButtonLabel() {
        return "보드에서 보기";
    }

    @Async
    public void sendMentionNotifications(Comment comment, User sender, Board board) {
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

        List<MemberSlackWebhook> webhooks = webhookRepository
                .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), filteredUserIds);

        if (webhooks.isEmpty()) {
            return;
        }

        Map<String, Object> payload = buildMentionPayload(comment, sender, board);
        sendToWebhooks(webhooks, payload, board.getId());
    }

    @Async
    public void sendChecklistAssignedNotification(ChecklistItem item, User assigner, Board board) {
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

        List<MemberSlackWebhook> webhooks = webhookRepository
                .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), filteredUserIds);
        if (webhooks.isEmpty()) {
            return;
        }

        Map<String, Object> payload = buildChecklistAssignedPayload(item, assigner, board);
        sendToWebhooks(webhooks, payload, board.getId());
    }

    @Async
    public void sendTaskCommentNotifications(Comment comment, User sender, Board board,
                                              List<String> recipientUserIds, Set<String> excludeUserIds) {
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

        List<MemberSlackWebhook> webhooks = webhookRepository
                .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), filteredUserIds);
        if (webhooks.isEmpty()) {
            return;
        }

        Map<String, Object> payload = buildTaskCommentPayload(comment, sender, board);
        sendToWebhooks(webhooks, payload, board.getId());
    }

    @Async
    public void sendMeetingMemoNotifications(Meeting meeting, User sender, Board board, List<String> participantIds) {
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

        List<MemberSlackWebhook> webhooks = webhookRepository
                .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), filteredUserIds);
        if (webhooks.isEmpty()) {
            return;
        }

        Map<String, Object> payload = buildMeetingMemoPayload(meeting, sender, board);
        sendToWebhooks(webhooks, payload, board.getId());
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

    private Map<String, Object> buildMentionPayload(Comment comment, User sender, Board board) {
        String taskTitle = comment.getTask() != null ? comment.getTask().getTitle() : "Unknown Task";
        String commentContent = comment.getContent();
        if (commentContent != null && commentContent.length() > 200) {
            commentContent = commentContent.substring(0, 200) + "...";
        }

        String boardUrl = frontendUrl + "/boards/" + board.getId();

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

    private Map<String, Object> buildChecklistAssignedPayload(ChecklistItem item, User assigner, Board board) {
        String taskTitle = item.getTask() != null ? item.getTask().getTitle() : "Unknown Task";
        String boardUrl = frontendUrl + "/boards/" + board.getId();

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

    private Map<String, Object> buildMeetingMemoPayload(Meeting meeting, User sender, Board board) {
        String boardUrl = frontendUrl + "/boards/" + board.getId() + "?view=schedule&tab=meeting";
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

    private Map<String, Object> buildTaskCommentPayload(Comment comment, User sender, Board board) {
        String taskTitle = comment.getTask() != null ? comment.getTask().getTitle() : "Unknown Task";
        String commentContent = comment.getContent();
        if (commentContent != null && commentContent.length() > 200) {
            commentContent = commentContent.substring(0, 200) + "...";
        }

        String boardUrl = frontendUrl + "/boards/" + board.getId();

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
