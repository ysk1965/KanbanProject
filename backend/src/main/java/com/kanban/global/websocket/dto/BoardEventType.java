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
    TASKS_REORDERED,

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
    CHECKLIST_MOVED,

    // Sprint events (스프린트 네이티브 뮤테이션: 담기/빼기/컬럼 이동·CRUD/라이프사이클)
    // 페이로드 없이 "스프린트 보드가 바뀌었으니 재조회하라"는 신호. useSprintRealtime 훅이 소비.
    SPRINT_UPDATED,

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
