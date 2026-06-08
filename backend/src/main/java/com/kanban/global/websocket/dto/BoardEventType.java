package com.kanban.global.websocket.dto;

public enum BoardEventType {
    // Feature events
    FEATURE_CREATED,
    FEATURE_UPDATED,
    FEATURE_DELETED,
    FEATURE_RESTORED,
    FEATURES_REORDERED,

    // Task events
    TASK_CREATED,
    TASK_UPDATED,
    TASK_DELETED,
    TASK_MOVED,
    TASK_RESTORED,

    // Block events
    BLOCK_CREATED,
    BLOCK_UPDATED,
    BLOCK_DELETED,
    BLOCKS_REORDERED,
    BLOCK_VISIBILITY_CHANGED,

    // Comment events
    COMMENT_CREATED,
    COMMENT_UPDATED,
    COMMENT_DELETED,
    COMMENT_REACTION_TOGGLED,

    // Checklist events
    CHECKLIST_CREATED,
    CHECKLIST_UPDATED,
    CHECKLIST_DELETED,
    CHECKLIST_RESTORED,
    CHECKLIST_TOGGLED,

    // Board events
    BOARD_UPDATED,

    // Member events
    MEMBER_JOINED,
    MEMBER_LEFT,
    MEMBER_UPDATED,

    // Job Role events
    JOB_ROLE_UPDATED,

    // Contractor events
    CONTRACTOR_UPDATED,

    // Notification events
    NOTIFICATION_CREATED,

    // Schedule events
    SCHEDULE_CREATED,
    SCHEDULE_UPDATED,
    SCHEDULE_DELETED,

    // Meeting events
    MEETING_CREATED,
    MEETING_UPDATED,
    MEETING_DELETED,
    TRANSCRIPTION_PROGRESS,
    TRANSCRIPTION_COMPLETE,
    TRANSCRIPTION_ERROR,

    // Presence events
    PRESENCE_JOINED,
    PRESENCE_LEFT,

    // Note comment events
    NOTE_COMMENT_CREATED,
    NOTE_COMMENT_UPDATED,
    NOTE_COMMENT_DELETED,
    NOTE_COMMENT_RESOLVED,
    NOTE_COMMENT_REACTION_TOGGLED,

    // Inquiry events (global user-level, not board-scoped)
    INQUIRY_REPLIED
}
