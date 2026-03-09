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
        private boolean meetingMemoSharedEnabled;
        private boolean slackMeetingMemoSharedEnabled;
        private boolean noteCommentMentionEnabled;
        private boolean slackNoteCommentMentionEnabled;
        private boolean discordCommentMentionEnabled;
        private boolean discordChecklistAssignedEnabled;
        private boolean discordTaskCommentEnabled;
        private boolean discordMeetingMemoSharedEnabled;
        private boolean discordNoteCommentMentionEnabled;
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
                    .meetingMemoSharedEnabled(p.getMeetingMemoSharedEnabled())
                    .slackMeetingMemoSharedEnabled(p.getSlackMeetingMemoSharedEnabled())
                    .noteCommentMentionEnabled(p.getNoteCommentMentionEnabled())
                    .slackNoteCommentMentionEnabled(p.getSlackNoteCommentMentionEnabled())
                    .discordCommentMentionEnabled(p.getDiscordCommentMentionEnabled())
                    .discordChecklistAssignedEnabled(p.getDiscordChecklistAssignedEnabled())
                    .discordTaskCommentEnabled(p.getDiscordTaskCommentEnabled())
                    .discordMeetingMemoSharedEnabled(p.getDiscordMeetingMemoSharedEnabled())
                    .discordNoteCommentMentionEnabled(p.getDiscordNoteCommentMentionEnabled())
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
                    .meetingMemoSharedEnabled(true)
                    .slackMeetingMemoSharedEnabled(true)
                    .noteCommentMentionEnabled(true)
                    .slackNoteCommentMentionEnabled(true)
                    .discordCommentMentionEnabled(true)
                    .discordChecklistAssignedEnabled(true)
                    .discordTaskCommentEnabled(true)
                    .discordMeetingMemoSharedEnabled(true)
                    .discordNoteCommentMentionEnabled(true)
                    .createdAt(null)
                    .updatedAt(null)
                    .build();
        }
    }
}
