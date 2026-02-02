package com.kanban.domain.notification.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.notification.Notification;
import com.kanban.domain.notification.NotificationRepository;
import com.kanban.domain.notification.NotificationType;
import com.kanban.domain.notification.dto.NotificationResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;

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
        }
    }

    public NotificationResponse.ListResponse getMyNotifications(String userId, LocalDateTime cursor, int limit) {
        PageRequest pageable = PageRequest.of(0, limit + 1);

        List<Notification> notifications;
        if (cursor != null) {
            notifications = notificationRepository.findByRecipientIdWithCursor(userId, cursor, pageable);
        } else {
            notifications = notificationRepository.findByRecipientIdOrderByCreatedAtDesc(userId, pageable);
        }

        boolean hasMore = notifications.size() > limit;
        List<Notification> trimmed = hasMore ? notifications.subList(0, limit) : notifications;

        LocalDateTime nextCursor = hasMore && !trimmed.isEmpty()
                ? trimmed.get(trimmed.size() - 1).getCreatedAt()
                : null;

        long unreadCount = notificationRepository.countUnreadByRecipientId(userId);

        return NotificationResponse.ListResponse.builder()
                .notifications(trimmed.stream().map(NotificationResponse.Detail::of).toList())
                .unreadCount(unreadCount)
                .hasMore(hasMore)
                .nextCursor(nextCursor)
                .build();
    }

    public NotificationResponse.UnreadCountResponse getUnreadCount(String userId) {
        long count = notificationRepository.countUnreadByRecipientId(userId);
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
    public void markAllAsRead(String userId) {
        notificationRepository.markAllAsRead(userId, LocalDateTime.now());
    }
}
