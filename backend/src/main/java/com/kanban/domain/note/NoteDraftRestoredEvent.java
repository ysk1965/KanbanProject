package com.kanban.domain.note;

/**
 * Published when a user restores (되돌리기) a previously discarded collab draft.
 * The collab WebSocket handler reloads the room's in-memory state from the
 * restored DB row so a client that re-enters EDIT receives it as MSG_SYNC_FULL.
 */
public record NoteDraftRestoredEvent(String noteId) {}
