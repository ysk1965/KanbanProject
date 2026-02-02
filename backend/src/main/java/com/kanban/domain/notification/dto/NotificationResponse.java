package com.kanban.domain.notification.dto;

import com.kanban.domain.notification.Notification;
import com.kanban.domain.notification.NotificationType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public class NotificationResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private NotificationType type;
        private String title;
        private String message;
        private String boardId;
        private String boardName;
        private String taskId;
        private String commentId;
        private SenderInfo sender;
        private boolean read;
        private LocalDateTime readAt;
        private LocalDateTime createdAt;

        public static Detail of(Notification n) {
            Map<String, Object> meta = n.getMetadata();
            return Detail.builder()
                    .id(n.getId())
                    .type(n.getType())
                    .title(n.getTitle())
                    .message(n.getMessage())
                    .boardId(n.getBoard().getId())
                    .boardName(meta != null ? (String) meta.get("boardName") : null)
                    .taskId(n.getTaskId())
                    .commentId(n.getCommentId())
                    .sender(SenderInfo.builder()
                            .id(n.getSenderId())
                            .name(meta != null ? (String) meta.get("senderName") : null)
                            .profileImage(meta != null ? (String) meta.get("senderProfileImage") : null)
                            .build())
                    .read(n.isRead())
                    .readAt(n.getReadAt())
                    .createdAt(n.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SenderInfo {
        private String id;
        private String name;
        private String profileImage;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> notifications;
        private long unreadCount;
        private boolean hasMore;
        private LocalDateTime nextCursor;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class UnreadCountResponse {
        private long unreadCount;
    }
}
