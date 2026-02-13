package com.kanban.domain.notification.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.notification.Notification;
import com.kanban.domain.notification.NotificationPreference;
import com.kanban.domain.notification.NotificationPreferenceRepository;
import com.kanban.domain.notification.NotificationRepository;
import com.kanban.domain.notification.NotificationType;
import com.kanban.domain.notification.dto.NotificationResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final NotificationPreferenceRepository preferenceRepository;
    private final UserRepository userRepository;
    private final WebSocketEventService webSocketEventService;

    @Transactional
    public void createMentionNotifications(Comment comment, User sender, Board board) {
        if (comment.getMentions() == null || comment.getMentions().isEmpty()) {
            return;
        }

        List<String> mentionedUserIds = Arrays.asList(comment.getMentions().split(","));

        for (String mentionedUserId : mentionedUserIds) {
            String trimmedId = mentionedUserId.trim();
            if (trimmedId.equals(sender.getId())) {
                continue;
            }

            if (!isInAppEnabled(trimmedId, board.getId(), NotificationType.COMMENT_MENTION)) {
                continue;
            }

            User recipient = userRepository.findById(trimmedId).orElse(null);
            if (recipient == null) {
                log.warn("Mentioned user not found: {}", trimmedId);
                continue;
            }

            Map<String, Object> metadata = new HashMap<>();
            metadata.put("senderName", sender.getName());
            metadata.put("senderProfileImage", sender.getProfileImage() != null ? sender.getProfileImage() : "");
            metadata.put("boardName", board.getName());
            metadata.put("taskTitle", comment.getTask().getTitle());

            Notification notification = Notification.builder()
                    .recipient(recipient)
                    .board(board)
                    .type(NotificationType.COMMENT_MENTION)
                    .title(sender.getName() + "님이 댓글에서 회원님을 멘션했습니다")
                    .message(comment.getContent())
                    .taskId(comment.getTask().getId())
                    .commentId(comment.getId())
                    .senderId(sender.getId())
                    .metadata(metadata)
                    .build();

            notificationRepository.save(notification);
            log.info("Mention notification created for user: {} from comment: {}", trimmedId, comment.getId());

            // Send WebSocket event to specific user
            NotificationResponse.Detail response = NotificationResponse.Detail.of(notification);
            webSocketEventService.sendUserEvent(board.getId(), trimmedId, BoardEventType.NOTIFICATION_CREATED, response);
        }
    }

    @Transactional
    public void createChecklistAssignedNotification(ChecklistItem item, User assigner, Board board) {
        User assignee = item.getAssignee();
        if (assignee == null || assignee.getId().equals(assigner.getId())) {
            return;
        }

        if (!isInAppEnabled(assignee.getId(), board.getId(), NotificationType.CHECKLIST_ASSIGNED)) {
            return;
        }

        Task task = item.getTask();

        Map<String, Object> metadata = new HashMap<>();
        metadata.put("senderName", assigner.getName());
        metadata.put("senderProfileImage", assigner.getProfileImage() != null ? assigner.getProfileImage() : "");
        metadata.put("boardName", board.getName());
        metadata.put("taskTitle", task.getTitle());
        metadata.put("checklistTitle", item.getTitle());

        Notification notification = Notification.builder()
                .recipient(assignee)
                .board(board)
                .type(NotificationType.CHECKLIST_ASSIGNED)
                .title(assigner.getName() + "님이 체크리스트 항목을 배정했습니다")
                .message(item.getTitle())
                .taskId(task.getId())
                .senderId(assigner.getId())
                .metadata(metadata)
                .build();

        notificationRepository.save(notification);
        log.info("Checklist assigned notification created for user: {} item: {}", assignee.getId(), item.getId());

        // Send WebSocket event to specific user
        NotificationResponse.Detail response = NotificationResponse.Detail.of(notification);
        webSocketEventService.sendUserEvent(board.getId(), assignee.getId(), BoardEventType.NOTIFICATION_CREATED, response);
    }

    @Transactional
    public void createTaskCommentNotifications(Comment comment, User sender, Board board,
                                                List<String> recipientUserIds, Set<String> excludeUserIds) {
        for (String recipientId : recipientUserIds) {
            if (recipientId.equals(sender.getId())) {
                continue;
            }
            if (excludeUserIds.contains(recipientId)) {
                continue;
            }
            if (!isInAppEnabled(recipientId, board.getId(), NotificationType.TASK_COMMENT)) {
                continue;
            }

            User recipient = userRepository.findById(recipientId).orElse(null);
            if (recipient == null) {
                continue;
            }

            Map<String, Object> metadata = new HashMap<>();
            metadata.put("senderName", sender.getName());
            metadata.put("senderProfileImage", sender.getProfileImage() != null ? sender.getProfileImage() : "");
            metadata.put("boardName", board.getName());
            metadata.put("taskTitle", comment.getTask().getTitle());

            Notification notification = Notification.builder()
                    .recipient(recipient)
                    .board(board)
                    .type(NotificationType.TASK_COMMENT)
                    .title(sender.getName() + "님이 태스크에 댓글을 남겼습니다")
                    .message(comment.getContent())
                    .taskId(comment.getTask().getId())
                    .commentId(comment.getId())
                    .senderId(sender.getId())
                    .metadata(metadata)
                    .build();

            notificationRepository.save(notification);
            log.info("Task comment notification created for user: {} from comment: {}", recipientId, comment.getId());

            // Send WebSocket event to specific user
            NotificationResponse.Detail response = NotificationResponse.Detail.of(notification);
            webSocketEventService.sendUserEvent(board.getId(), recipientId, BoardEventType.NOTIFICATION_CREATED, response);
        }
    }

    @Transactional
    public void createMeetingMemoNotifications(Meeting meeting, User sender, Board board, List<String> participantIds) {
        for (String participantId : participantIds) {
            if (!isInAppEnabled(participantId, board.getId(), NotificationType.MEETING_MEMO_SHARED)) {
                continue;
            }

            User recipient = userRepository.findById(participantId).orElse(null);
            if (recipient == null) {
                continue;
            }

            Map<String, Object> metadata = new HashMap<>();
            metadata.put("senderName", sender.getName());
            metadata.put("senderProfileImage", sender.getProfileImage() != null ? sender.getProfileImage() : "");
            metadata.put("boardName", board.getName());
            metadata.put("meetingTitle", meeting.getTitle());

            Notification notification = Notification.builder()
                    .recipient(recipient)
                    .board(board)
                    .type(NotificationType.MEETING_MEMO_SHARED)
                    .title(sender.getName() + "님이 회의록을 공유했습니다")
                    .message(meeting.getTitle())
                    .senderId(sender.getId())
                    .metadata(metadata)
                    .build();

            notificationRepository.save(notification);
            log.info("Meeting memo notification created for user: {} meeting: {}", participantId, meeting.getId());

            // Send WebSocket event to specific user
            NotificationResponse.Detail response = NotificationResponse.Detail.of(notification);
            webSocketEventService.sendUserEvent(board.getId(), participantId, BoardEventType.NOTIFICATION_CREATED, response);
        }
    }

    public boolean isInAppEnabled(String userId, String boardId, NotificationType type) {
        return preferenceRepository.findByBoardIdAndUserId(boardId, userId)
                .map(p -> p.isInAppEnabled(type))
                .orElse(true);
    }

    public NotificationResponse.ListResponse getMyNotifications(String userId, String boardId, LocalDateTime cursor, int limit) {
        PageRequest pageable = PageRequest.of(0, limit + 1);

        List<Notification> notifications;
        if (boardId != null) {
            if (cursor != null) {
                notifications = notificationRepository.findByRecipientIdAndBoardIdWithCursor(userId, boardId, cursor, pageable);
            } else {
                notifications = notificationRepository.findByRecipientIdAndBoardIdOrderByCreatedAtDesc(userId, boardId, pageable);
            }
        } else {
            if (cursor != null) {
                notifications = notificationRepository.findByRecipientIdWithCursor(userId, cursor, pageable);
            } else {
                notifications = notificationRepository.findByRecipientIdOrderByCreatedAtDesc(userId, pageable);
            }
        }

        boolean hasMore = notifications.size() > limit;
        List<Notification> trimmed = hasMore ? notifications.subList(0, limit) : notifications;

        LocalDateTime nextCursor = hasMore && !trimmed.isEmpty()
                ? trimmed.get(trimmed.size() - 1).getCreatedAt()
                : null;

        long unreadCount = boardId != null
                ? notificationRepository.countUnreadByRecipientIdAndBoardId(userId, boardId)
                : notificationRepository.countUnreadByRecipientId(userId);

        return NotificationResponse.ListResponse.builder()
                .notifications(trimmed.stream().map(NotificationResponse.Detail::of).toList())
                .unreadCount(unreadCount)
                .hasMore(hasMore)
                .nextCursor(nextCursor)
                .build();
    }

    public NotificationResponse.UnreadCountResponse getUnreadCount(String userId, String boardId) {
        long count = boardId != null
                ? notificationRepository.countUnreadByRecipientIdAndBoardId(userId, boardId)
                : notificationRepository.countUnreadByRecipientId(userId);
        return NotificationResponse.UnreadCountResponse.builder()
                .unreadCount(count)
                .build();
    }

    @Transactional
    public NotificationResponse.Detail markAsRead(String notificationId, String userId) {
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOTIFICATION_NOT_FOUND));

        if (!notification.getRecipient().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.NOTIFICATION_NOT_FOUND);
        }

        notification.markAsRead();
        return NotificationResponse.Detail.of(notification);
    }

    @Transactional
    public void markAllAsRead(String userId, String boardId) {
        if (boardId != null) {
            notificationRepository.markAllAsReadByBoard(userId, boardId, LocalDateTime.now(ZoneOffset.UTC));
        } else {
            notificationRepository.markAllAsRead(userId, LocalDateTime.now(ZoneOffset.UTC));
        }
    }
}
