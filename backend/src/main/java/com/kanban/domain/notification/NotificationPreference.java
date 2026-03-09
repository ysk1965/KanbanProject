package com.kanban.domain.notification;

import com.kanban.domain.board.Board;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "notification_preferences",
    uniqueConstraints = @UniqueConstraint(name = "uk_notif_pref_board_user", columnNames = {"board_id", "user_id"}),
    indexes = {
        @Index(name = "idx_notif_pref_board_user", columnList = "board_id, user_id")
    })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class NotificationPreference {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "comment_mention_enabled", nullable = false)
    @Builder.Default
    private Boolean commentMentionEnabled = true;

    @Column(name = "checklist_assigned_enabled", nullable = false)
    @Builder.Default
    private Boolean checklistAssignedEnabled = true;

    @Column(name = "task_comment_enabled", nullable = false)
    @Builder.Default
    private Boolean taskCommentEnabled = true;

    @Column(name = "slack_comment_mention_enabled", nullable = false)
    @Builder.Default
    private Boolean slackCommentMentionEnabled = true;

    @Column(name = "slack_checklist_assigned_enabled", nullable = false)
    @Builder.Default
    private Boolean slackChecklistAssignedEnabled = true;

    @Column(name = "slack_task_comment_enabled", nullable = false)
    @Builder.Default
    private Boolean slackTaskCommentEnabled = true;

    @Column(name = "meeting_memo_shared_enabled", nullable = false)
    @Builder.Default
    private Boolean meetingMemoSharedEnabled = true;

    @Column(name = "slack_meeting_memo_shared_enabled", nullable = false)
    @Builder.Default
    private Boolean slackMeetingMemoSharedEnabled = true;

    @Column(name = "note_comment_mention_enabled", nullable = false, columnDefinition = "boolean not null default true")
    @Builder.Default
    private Boolean noteCommentMentionEnabled = true;

    @Column(name = "slack_note_comment_mention_enabled", nullable = false, columnDefinition = "boolean not null default true")
    @Builder.Default
    private Boolean slackNoteCommentMentionEnabled = true;

    @Column(name = "discord_comment_mention_enabled", nullable = false, columnDefinition = "boolean not null default true")
    @Builder.Default
    private Boolean discordCommentMentionEnabled = true;

    @Column(name = "discord_checklist_assigned_enabled", nullable = false, columnDefinition = "boolean not null default true")
    @Builder.Default
    private Boolean discordChecklistAssignedEnabled = true;

    @Column(name = "discord_task_comment_enabled", nullable = false, columnDefinition = "boolean not null default true")
    @Builder.Default
    private Boolean discordTaskCommentEnabled = true;

    @Column(name = "discord_meeting_memo_shared_enabled", nullable = false, columnDefinition = "boolean not null default true")
    @Builder.Default
    private Boolean discordMeetingMemoSharedEnabled = true;

    @Column(name = "discord_note_comment_mention_enabled", nullable = false, columnDefinition = "boolean not null default true")
    @Builder.Default
    private Boolean discordNoteCommentMentionEnabled = true;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (this.createdAt == null) this.createdAt = now;
        if (this.updatedAt == null) this.updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void update(Boolean commentMentionEnabled, Boolean checklistAssignedEnabled, Boolean taskCommentEnabled,
                       Boolean slackCommentMentionEnabled, Boolean slackChecklistAssignedEnabled, Boolean slackTaskCommentEnabled,
                       Boolean meetingMemoSharedEnabled, Boolean slackMeetingMemoSharedEnabled,
                       Boolean noteCommentMentionEnabled, Boolean slackNoteCommentMentionEnabled,
                       Boolean discordCommentMentionEnabled, Boolean discordChecklistAssignedEnabled,
                       Boolean discordTaskCommentEnabled, Boolean discordMeetingMemoSharedEnabled,
                       Boolean discordNoteCommentMentionEnabled) {
        if (commentMentionEnabled != null) this.commentMentionEnabled = commentMentionEnabled;
        if (checklistAssignedEnabled != null) this.checklistAssignedEnabled = checklistAssignedEnabled;
        if (taskCommentEnabled != null) this.taskCommentEnabled = taskCommentEnabled;
        if (slackCommentMentionEnabled != null) this.slackCommentMentionEnabled = slackCommentMentionEnabled;
        if (slackChecklistAssignedEnabled != null) this.slackChecklistAssignedEnabled = slackChecklistAssignedEnabled;
        if (slackTaskCommentEnabled != null) this.slackTaskCommentEnabled = slackTaskCommentEnabled;
        if (meetingMemoSharedEnabled != null) this.meetingMemoSharedEnabled = meetingMemoSharedEnabled;
        if (slackMeetingMemoSharedEnabled != null) this.slackMeetingMemoSharedEnabled = slackMeetingMemoSharedEnabled;
        if (noteCommentMentionEnabled != null) this.noteCommentMentionEnabled = noteCommentMentionEnabled;
        if (slackNoteCommentMentionEnabled != null) this.slackNoteCommentMentionEnabled = slackNoteCommentMentionEnabled;
        if (discordCommentMentionEnabled != null) this.discordCommentMentionEnabled = discordCommentMentionEnabled;
        if (discordChecklistAssignedEnabled != null) this.discordChecklistAssignedEnabled = discordChecklistAssignedEnabled;
        if (discordTaskCommentEnabled != null) this.discordTaskCommentEnabled = discordTaskCommentEnabled;
        if (discordMeetingMemoSharedEnabled != null) this.discordMeetingMemoSharedEnabled = discordMeetingMemoSharedEnabled;
        if (discordNoteCommentMentionEnabled != null) this.discordNoteCommentMentionEnabled = discordNoteCommentMentionEnabled;
    }

    public boolean isInAppEnabled(NotificationType type) {
        return switch (type) {
            case COMMENT_MENTION -> commentMentionEnabled;
            case CHECKLIST_ASSIGNED -> checklistAssignedEnabled;
            case TASK_COMMENT -> taskCommentEnabled;
            case MEETING_MEMO_SHARED -> meetingMemoSharedEnabled;
            case NOTE_COMMENT_MENTION -> noteCommentMentionEnabled;
            case ANNIVERSARY -> true; // Controlled by org-level anniversary settings
            case PAYMENT_FAILED -> true; // Always enabled (critical billing notification)
            case BOARD_JOIN_REQUEST, BOARD_JOIN_APPROVED, BOARD_JOIN_REJECTED -> true; // Always enabled
        };
    }

    public boolean isSlackEnabled(NotificationType type) {
        return switch (type) {
            case COMMENT_MENTION -> slackCommentMentionEnabled;
            case CHECKLIST_ASSIGNED -> slackChecklistAssignedEnabled;
            case TASK_COMMENT -> slackTaskCommentEnabled;
            case MEETING_MEMO_SHARED -> slackMeetingMemoSharedEnabled;
            case NOTE_COMMENT_MENTION -> slackNoteCommentMentionEnabled;
            case ANNIVERSARY -> false; // Not applicable for Slack
            case PAYMENT_FAILED -> false; // Not applicable for Slack
            case BOARD_JOIN_REQUEST, BOARD_JOIN_APPROVED, BOARD_JOIN_REJECTED -> false;
        };
    }

    public boolean isDiscordEnabled(NotificationType type) {
        return switch (type) {
            case COMMENT_MENTION -> discordCommentMentionEnabled;
            case CHECKLIST_ASSIGNED -> discordChecklistAssignedEnabled;
            case TASK_COMMENT -> discordTaskCommentEnabled;
            case MEETING_MEMO_SHARED -> discordMeetingMemoSharedEnabled;
            case NOTE_COMMENT_MENTION -> discordNoteCommentMentionEnabled;
            case ANNIVERSARY -> false; // Not applicable for Discord
            case PAYMENT_FAILED -> false; // Not applicable for Discord
            case BOARD_JOIN_REQUEST, BOARD_JOIN_APPROVED, BOARD_JOIN_REJECTED -> false;
        };
    }
}
