package com.kanban.domain.integration.discord.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.integration.discord.DiscordBotConfig;
import com.kanban.domain.integration.discord.DiscordBotConfigRepository;
import com.kanban.domain.integration.discord.DiscordUserLink;
import com.kanban.domain.integration.discord.DiscordUserLinkRepository;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.note.NoteComment;
import com.kanban.domain.notification.NotificationPreference;
import com.kanban.domain.notification.NotificationPreferenceRepository;
import com.kanban.domain.notification.NotificationType;
import com.kanban.domain.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DiscordNotificationService {

    private final DiscordBotService discordBotService;
    private final DiscordBotConfigRepository botConfigRepository;
    private final DiscordUserLinkRepository userLinkRepository;
    private final NotificationPreferenceRepository preferenceRepository;

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

        String resolvedUrl = resolveFrontendUrl(originUrl);
        String boardUrl = resolvedUrl + "/boards/" + board.getId();
        Map<String, Object> payload = buildMentionPayload(comment, sender, board, boardUrl);
        sendDmToUsers(filteredUserIds, payload, board.getId());
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

        String resolvedUrl = resolveFrontendUrl(originUrl);
        String boardUrl = resolvedUrl + "/boards/" + board.getId();
        Map<String, Object> payload = buildChecklistAssignedPayload(item, assigner, board, boardUrl);
        sendDmToUsers(filteredUserIds, payload, board.getId());
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

        String resolvedUrl = resolveFrontendUrl(originUrl);
        String boardUrl = resolvedUrl + "/boards/" + board.getId();
        Map<String, Object> payload = buildTaskCommentPayload(comment, sender, board, boardUrl);
        sendDmToUsers(filteredUserIds, payload, board.getId());
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

        String resolvedUrl = resolveFrontendUrl(originUrl);
        String boardUrl = resolvedUrl + "/boards/" + board.getId() + "?view=schedule&tab=meeting";
        Map<String, Object> payload = buildMeetingMemoPayload(meeting, sender, board, boardUrl);
        sendDmToUsers(filteredUserIds, payload, board.getId());
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

        String resolvedUrl = resolveFrontendUrl(originUrl);
        String boardUrl = resolvedUrl + "/boards/" + board.getId() + "?view=notes";
        Map<String, Object> payload = buildNoteCommentMentionPayload(noteComment, sender, board, boardUrl);
        sendDmToUsers(filteredUserIds, payload, board.getId());
    }

    // --- Payload Builders ---

    private Map<String, Object> buildMentionPayload(Comment comment, User sender, Board board, String boardUrl) {
        String taskTitle = comment.getTask() != null ? comment.getTask().getTitle() : "Unknown Task";
        String commentContent = truncate(comment.getContent(), 200);

        String description = (commentContent != null && !commentContent.isBlank())
                ? "> " + commentContent
                : "";

        return buildEmbedPayload("\uD83D\uDCAC @\uBA58\uC158 \uC54C\uB9BC", description, board.getName(), taskTitle, sender.getName(), boardUrl);
    }

    private Map<String, Object> buildChecklistAssignedPayload(ChecklistItem item, User assigner, Board board, String boardUrl) {
        String taskTitle = item.getTask() != null ? item.getTask().getTitle() : "Unknown Task";
        String description = "**\uCCB4\uD06C\uB9AC\uC2A4\uD2B8:** " + item.getTitle();

        List<Map<String, Object>> fields = new ArrayList<>();
        fields.add(Map.of("name", "Board", "value", board.getName(), "inline", true));
        fields.add(Map.of("name", "Task", "value", taskTitle, "inline", true));
        fields.add(Map.of("name", "\uBC30\uC815\uC790", "value", assigner.getName(), "inline", true));

        return buildEmbedPayloadWithFields("\uD83D\uDCCB \uCCB4\uD06C\uB9AC\uC2A4\uD2B8 \uBC30\uC815 \uC54C\uB9BC", description, fields, boardUrl);
    }

    private Map<String, Object> buildTaskCommentPayload(Comment comment, User sender, Board board, String boardUrl) {
        String taskTitle = comment.getTask() != null ? comment.getTask().getTitle() : "Unknown Task";
        String commentContent = truncate(comment.getContent(), 200);

        String description = (commentContent != null && !commentContent.isBlank())
                ? "> " + commentContent
                : "";

        return buildEmbedPayload("\uD83D\uDCAC \uC0C8 \uB313\uAE00 \uC54C\uB9BC", description, board.getName(), taskTitle, sender.getName(), boardUrl);
    }

    private Map<String, Object> buildMeetingMemoPayload(Meeting meeting, User sender, Board board, String boardUrl) {
        String memoPreview = truncate(meeting.getMemo(), 200);

        String description = (memoPreview != null && !memoPreview.isBlank())
                ? "> " + memoPreview
                : "";

        return buildEmbedPayload("\uD83D\uDCCB \uD68C\uC758\uB85D \uACF5\uC720", description, board.getName(), meeting.getTitle(), sender.getName(), boardUrl);
    }

    private Map<String, Object> buildNoteCommentMentionPayload(NoteComment noteComment, User sender, Board board, String boardUrl) {
        String noteTitle = noteComment.getNote().getTitle();
        String commentContent = truncate(noteComment.getContent(), 200);

        String description = (commentContent != null && !commentContent.isBlank())
                ? "> " + commentContent
                : "";

        return buildEmbedPayload("\uD83D\uDCDD \uB178\uD2B8 \uB313\uAE00 \uBA58\uC158", description, board.getName(), noteTitle, sender.getName(), boardUrl);
    }

    /**
     * Standard 3-field embed: Board / Task(Note/Meeting) / Author, with action button.
     */
    private Map<String, Object> buildEmbedPayload(String title, String description,
                                                    String boardName, String itemTitle, String authorName, String boardUrl) {
        List<Map<String, Object>> fields = new ArrayList<>();
        fields.add(Map.of("name", "Board", "value", boardName, "inline", true));
        fields.add(Map.of("name", "Task", "value", itemTitle, "inline", true));
        fields.add(Map.of("name", "Author", "value", authorName, "inline", true));

        return buildEmbedPayloadWithFields(title, description, fields, boardUrl);
    }

    private Map<String, Object> buildEmbedPayloadWithFields(String title, String description,
                                                              List<Map<String, Object>> fields, String boardUrl) {
        Map<String, Object> embed = new LinkedHashMap<>();
        embed.put("title", title);
        embed.put("description", description);
        embed.put("color", DISCORD_EMBED_COLOR);
        embed.put("fields", fields);
        embed.put("footer", Map.of("text", "BRIDGE SPOTS"));
        embed.put("timestamp", Instant.now().toString());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("embeds", List.of(embed));
        // Message Components: "보드에서 보기" action button
        payload.put("components", List.of(Map.of(
                "type", 1,
                "components", List.of(Map.of(
                        "type", 2,
                        "style", 5,
                        "label", "\uBCF4\uB4DC\uC5D0\uC11C \uBCF4\uAE30",
                        "url", boardUrl
                ))
        )));

        return payload;
    }

    // --- Helpers ---

    /**
     * Send DM to each linked Discord user via the Bot.
     */
    private void sendDmToUsers(List<String> userIds, Map<String, Object> payload, String boardId) {
        // Check if bot is configured for this board
        Optional<DiscordBotConfig> botConfig = botConfigRepository.findByBoardId(boardId);
        if (botConfig.isEmpty()) {
            log.debug("No Discord bot configured for board {}, skipping DM notifications", boardId);
            return;
        }

        // Find Discord links for all target users
        List<DiscordUserLink> userLinks = userLinkRepository.findByUserIdIn(userIds);
        if (userLinks.isEmpty()) {
            log.debug("No Discord-linked users found for board {} notification", boardId);
            return;
        }

        for (DiscordUserLink link : userLinks) {
            try {
                discordBotService.sendDirectMessage(link.getDiscordUserId(), payload);
                log.info("Discord DM notification sent to user {} (discord: {}) on board {}",
                        link.getUser().getId(), link.getDiscordUserId(), boardId);
            } catch (Exception e) {
                log.warn("Failed to send Discord DM to user {} (discord: {}) on board {}: {}",
                        link.getUser().getId(), link.getDiscordUserId(), boardId, e.getMessage());
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
