package com.kanban.domain.activity;

public enum ActivityAction {
    // Board actions
    BOARD_CREATED,
    BOARD_UPDATED,

    // Block actions
    BLOCK_CREATED,
    BLOCK_UPDATED,
    BLOCK_DELETED,
    BLOCK_REORDERED,

    // Feature actions
    FEATURE_CREATED,
    FEATURE_UPDATED,
    FEATURE_DELETED,
    FEATURE_COMPLETED,

    // Task actions
    TASK_CREATED,
    TASK_UPDATED,
    TASK_DELETED,
    TASK_MOVED,
    TASK_COMPLETED,
    TASK_REOPENED,
    TASK_FEATURE_MOVED,

    // Checklist actions
    CHECKLIST_CREATED,
    CHECKLIST_CHECKED,
    CHECKLIST_MOVED,

    // Member actions
    MEMBER_INVITED,
    MEMBER_JOINED,
    MEMBER_ROLE_CHANGED,
    MEMBER_REMOVED,
    MEMBER_LEFT,

    // Tag actions
    TAG_CREATED,
    TAG_DELETED,

    // Subscription actions
    SUBSCRIPTION_STARTED,
    SUBSCRIPTION_CANCELED,
    SUBSCRIPTION_PLAN_CHANGED,

    // Planning actions
    PLANNING_CARD_CREATED,
    PLANNING_CARD_UPDATED,
    PLANNING_CARD_MOVED,
    PLANNING_CARD_DELETED
}
