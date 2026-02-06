package com.kanban.domain.notification.dto;

import com.kanban.domain.notification.NotificationPreference;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

public class NotificationPreferenceResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String boardId;
        private boolean commentMentionEnabled;
        private boolean checklistAssignedEnabled;
        private boolean taskCommentEnabled;
        private boolean slackCommentMentionEnabled;
        private boolean slackChecklistAssignedEnabled;
        private boolean slackTaskCommentEnabled;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(NotificationPreference p) {
            return Detail.builder()
                    .id(p.getId())
                    .boardId(p.getBoard().getId())
                    .commentMentionEnabled(p.getCommentMentionEnabled())
                    .checklistAssignedEnabled(p.getChecklistAssignedEnabled())
                    .taskCommentEnabled(p.getTaskCommentEnabled())
                    .slackCommentMentionEnabled(p.getSlackCommentMentionEnabled())
                    .slackChecklistAssignedEnabled(p.getSlackChecklistAssignedEnabled())
                    .slackTaskCommentEnabled(p.getSlackTaskCommentEnabled())
                    .createdAt(p.getCreatedAt())
                    .updatedAt(p.getUpdatedAt())
                    .build();
        }

        public static Detail defaultPreference(String boardId) {
            return Detail.builder()
                    .id(null)
                    .boardId(boardId)
                    .commentMentionEnabled(true)
                    .checklistAssignedEnabled(true)
                    .taskCommentEnabled(true)
                    .slackCommentMentionEnabled(true)
                    .slackChecklistAssignedEnabled(true)
                    .slackTaskCommentEnabled(true)
                    .createdAt(null)
                    .updatedAt(null)
                    .build();
        }
    }
}
