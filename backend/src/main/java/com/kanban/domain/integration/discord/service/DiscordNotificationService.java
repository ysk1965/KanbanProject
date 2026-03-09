package com.kanban.domain.integration.discord.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.integration.discord.MemberDiscordWebhook;
import com.kanban.domain.integration.discord.MemberDiscordWebhookRepository;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.note.NoteComment;
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

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DiscordNotificationService {

    private final MemberDiscordWebhookRepository webhookRepository;
    private final NotificationPreferenceRepository preferenceRepository;
    private final RestTemplate restTemplate;

    // Bridge Accent #6366F1
    private static final int DISCORD_EMBED_COLOR = 0x6366F1;

    @Value("${app.frontend-url:https://bridgespots.com}")
    private String frontendUrl;

    private String resolveFrontendUrl(String originUrl) {
        return (originUrl != null && !originUrl.isBlank()) ? originUrl.replaceAll("/+$", "") : frontendUrl;
    }

    private String truncate(String text, int maxLength) {
        if (text == null) return null;
        return text.length() > maxLength ? text.substring(0, maxLength) + "..." : text;
    }

    @Async
    @Transactional(readOnly = true)
    public void sendMentionNotifications(Comment comment, User sender, Board board, String originUrl) {
        if (!board.canAccessDiscord()) {
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

        List<String> filteredUserIds = filterByDiscordPreference(board.getId(), mentionedUserIds, NotificationType.COMMENT_MENTION);
        if (filteredUserIds.isEmpty()) {
            return;
        }

        List<MemberDiscordWebhook> webhooks = webhookRepository
                .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), filteredUserIds);

        if (webhooks.isEmpty()) {
            return;
        }

        String resolvedUrl = resolveFrontendUrl(originUrl);
        Map<String, Object> payload = buildMentionPayload(comment, sender, board, resolvedUrl);
        sendToWebhooks(webhooks, payload, board.getId());
    }

    @Async
    @Transactional(readOnly = true)
    public void sendChecklistAssignedNotification(ChecklistItem item, User assigner, Board board, String originUrl) {
        if (!board.canAccessDiscord()) {
            return;
        }
        User assignee = item.getAssignee();
        if (assignee == null || assignee.getId().equals(assigner.getId())) {
            return;
        }

        List<String> filteredUserIds = filterByDiscordPreference(board.getId(),
                List.of(assignee.getId()), NotificationType.CHECKLIST_ASSIGNED);
        if (filteredUserIds.isEmpty()) {
            return;
        }

        List<MemberDiscordWebhook> webhooks = webhookRepository
                .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), filteredUserIds);
        if (webhooks.isEmpty()) {
            return;
        }

        String resolvedUrl = resolveFrontendUrl(originUrl);
        Map<String, Object> payload = buildChecklistAssignedPayload(item, assigner, board, resolvedUrl);
        sendToWebhooks(webhooks, payload, board.getId());
    }

    @Async
    @Transactional(readOnly = true)
    public void sendTaskCommentNotifications(Comment comment, User sender, Board board,
                                              List<String> recipientUserIds, Set<String> excludeUserIds, String originUrl) {
        if (!board.canAccessDiscord()) {
            return;
        }
        List<String> targetUserIds = recipientUserIds.stream()
                .filter(id -> !id.equals(sender.getId()))
                .filter(id -> !excludeUserIds.contains(id))
                .toList();

        if (targetUserIds.isEmpty()) {
            return;
        }

        List<String> filteredUserIds = filterByDiscordPreference(board.getId(), targetUserIds, NotificationType.TASK_COMMENT);
        if (filteredUserIds.isEmpty()) {
            return;
        }

        List<MemberDiscordWebhook> webhooks = webhookRepository
                .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), filteredUserIds);
        if (webhooks.isEmpty()) {
            return;
        }

        String resolvedUrl = resolveFrontendUrl(originUrl);
        Map<String, Object> payload = buildTaskCommentPayload(comment, sender, board, resolvedUrl);
        sendToWebhooks(webhooks, payload, board.getId());
    }

    @Async
    @Transactional(readOnly = true)
    public void sendMeetingMemoNotifications(Meeting meeting, User sender, Board board, List<String> participantIds, String originUrl) {
        if (!board.canAccessDiscord()) {
            return;
        }
        if (participantIds.isEmpty()) {
            return;
        }

        List<String> filteredUserIds = filterByDiscordPreference(board.getId(), participantIds, NotificationType.MEETING_MEMO_SHARED);
        if (filteredUserIds.isEmpty()) {
            return;
        }

        List<MemberDiscordWebhook> webhooks = webhookRepository
                .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), filteredUserIds);
        if (webhooks.isEmpty()) {
            return;
        }

        String resolvedUrl = resolveFrontendUrl(originUrl);
        Map<String, Object> payload = buildMeetingMemoPayload(meeting, sender, board, resolvedUrl);
        sendToWebhooks(webhooks, payload, board.getId());
    }

    @Async
    @Transactional(readOnly = true)
    public void sendNoteCommentMentionNotifications(NoteComment noteComment, User sender, Board board, String originUrl) {
        if (!board.canAccessDiscord()) {
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

        List<String> filteredUserIds = filterByDiscordPreference(board.getId(), mentionedUserIds, NotificationType.NOTE_COMMENT_MENTION);
        if (filteredUserIds.isEmpty()) {
            return;
        }

        List<MemberDiscordWebhook> webhooks = webhookRepository
                .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), filteredUserIds);

        if (webhooks.isEmpty()) {
            return;
        }

        String resolvedUrl = resolveFrontendUrl(originUrl);
        Map<String, Object> payload = buildNoteCommentMentionPayload(noteComment, sender, board, resolvedUrl);
        sendToWebhooks(webhooks, payload, board.getId());
    }

    // --- Payload Builders ---

    private Map<String, Object> buildMentionPayload(Comment comment, User sender, Board board, String resolvedUrl) {
        String taskTitle = comment.getTask() != null ? comment.getTask().getTitle() : "Unknown Task";
        String commentContent = truncate(comment.getContent(), 200);
        String boardUrl = resolvedUrl + "/boards/" + board.getId();

        String description = (commentContent != null && !commentContent.isBlank())
                ? "> " + commentContent + "\n\n[보드에서 보기](" + boardUrl + ")"
                : "[보드에서 보기](" + boardUrl + ")";

        return buildEmbedPayload("\uD83D\uDCAC @멘션 알림", description, board.getName(), taskTitle, sender.getName());
    }

    private Map<String, Object> buildChecklistAssignedPayload(ChecklistItem item, User assigner, Board board, String resolvedUrl) {
        String taskTitle = item.getTask() != null ? item.getTask().getTitle() : "Unknown Task";
        String boardUrl = resolvedUrl + "/boards/" + board.getId();
        String description = "**체크리스트:** " + item.getTitle() + "\n\n[보드에서 보기](" + boardUrl + ")";

        List<Map<String, Object>> fields = new ArrayList<>();
        fields.add(Map.of("name", "Board", "value", board.getName(), "inline", true));
        fields.add(Map.of("name", "Task", "value", taskTitle, "inline", true));
        fields.add(Map.of("name", "배정자", "value", assigner.getName(), "inline", true));

        return buildEmbedPayloadWithFields("\uD83D\uDCCB 체크리스트 배정 알림", description, fields);
    }

    private Map<String, Object> buildTaskCommentPayload(Comment comment, User sender, Board board, String resolvedUrl) {
        String taskTitle = comment.getTask() != null ? comment.getTask().getTitle() : "Unknown Task";
        String commentContent = truncate(comment.getContent(), 200);
        String boardUrl = resolvedUrl + "/boards/" + board.getId();

        String description = (commentContent != null && !commentContent.isBlank())
                ? "> " + commentContent + "\n\n[보드에서 보기](" + boardUrl + ")"
                : "[보드에서 보기](" + boardUrl + ")";

        return buildEmbedPayload("\uD83D\uDCAC 새 댓글 알림", description, board.getName(), taskTitle, sender.getName());
    }

    private Map<String, Object> buildMeetingMemoPayload(Meeting meeting, User sender, Board board, String resolvedUrl) {
        String boardUrl = resolvedUrl + "/boards/" + board.getId() + "?view=schedule&tab=meeting";
        String memoPreview = truncate(meeting.getMemo(), 200);

        String description = (memoPreview != null && !memoPreview.isBlank())
                ? "> " + memoPreview + "\n\n[보드에서 보기](" + boardUrl + ")"
                : "[보드에서 보기](" + boardUrl + ")";

        return buildEmbedPayload("\uD83D\uDCCB 회의록 공유", description, board.getName(), meeting.getTitle(), sender.getName());
    }

    private Map<String, Object> buildNoteCommentMentionPayload(NoteComment noteComment, User sender, Board board, String resolvedUrl) {
        String noteTitle = noteComment.getNote().getTitle();
        String commentContent = truncate(noteComment.getContent(), 200);
        String boardUrl = resolvedUrl + "/boards/" + board.getId() + "?view=notes";

        String description = (commentContent != null && !commentContent.isBlank())
                ? "> " + commentContent + "\n\n[보드에서 보기](" + boardUrl + ")"
                : "[보드에서 보기](" + boardUrl + ")";

        return buildEmbedPayload("\uD83D\uDCDD 노트 댓글 멘션", description, board.getName(), noteTitle, sender.getName());
    }

    /**
     * Standard 3-field embed: Board / Task(Note/Meeting) / Author
     */
    private Map<String, Object> buildEmbedPayload(String title, String description,
                                                    String boardName, String itemTitle, String authorName) {
        List<Map<String, Object>> fields = new ArrayList<>();
        fields.add(Map.of("name", "Board", "value", boardName, "inline", true));
        fields.add(Map.of("name", "Task", "value", itemTitle, "inline", true));
        fields.add(Map.of("name", "Author", "value", authorName, "inline", true));

        return buildEmbedPayloadWithFields(title, description, fields);
    }

    private Map<String, Object> buildEmbedPayloadWithFields(String title, String description,
                                                              List<Map<String, Object>> fields) {
        Map<String, Object> embed = new LinkedHashMap<>();
        embed.put("title", title);
        embed.put("description", description);
        embed.put("color", DISCORD_EMBED_COLOR);
        embed.put("fields", fields);
        embed.put("footer", Map.of("text", "BRIDGE SPOTS"));
        embed.put("timestamp", Instant.now().toString());

        return Map.of("embeds", List.of(embed));
    }

    // --- Helpers ---

    private void sendToWebhooks(List<MemberDiscordWebhook> webhooks, Map<String, Object> payload, String boardId) {
        for (MemberDiscordWebhook webhook : webhooks) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);

                restTemplate.postForEntity(webhook.getWebhookUrl(), entity, String.class);
                log.info("Discord notification sent to user {} on board {}",
                        webhook.getUser().getId(), boardId);
            } catch (Exception e) {
                log.warn("Failed to send Discord notification to user {} on board {}: {}",
                        webhook.getUser().getId(), boardId, e.getMessage());
            }
        }
    }

    private List<String> filterByDiscordPreference(String boardId, List<String> userIds, NotificationType type) {
        Map<String, NotificationPreference> prefs = preferenceRepository
                .findByBoardIdAndUserIdIn(boardId, userIds).stream()
                .collect(Collectors.toMap(p -> p.getUser().getId(), p -> p));

        return userIds.stream()
                .filter(userId -> {
                    NotificationPreference pref = prefs.get(userId);
                    return pref == null || pref.isDiscordEnabled(type);
                })
                .toList();
    }
}
