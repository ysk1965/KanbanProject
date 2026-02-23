package com.kanban.domain.notification.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class NotificationPreferenceRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Update {
        private Boolean commentMentionEnabled;
        private Boolean checklistAssignedEnabled;
        private Boolean taskCommentEnabled;
        private Boolean slackCommentMentionEnabled;
        private Boolean slackChecklistAssignedEnabled;
        private Boolean slackTaskCommentEnabled;
        private Boolean meetingMemoSharedEnabled;
        private Boolean slackMeetingMemoSharedEnabled;
        private Boolean noteCommentMentionEnabled;
        private Boolean slackNoteCommentMentionEnabled;
    }
}
