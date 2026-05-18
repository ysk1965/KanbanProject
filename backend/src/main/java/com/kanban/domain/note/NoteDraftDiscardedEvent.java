package com.kanban.domain.note;

/**
 * Published when a user discards the unpublished collab draft. Listeners
 * (notably the collab WebSocket handler) clear the in-memory room cache so
 * the next ws joiner doesn't get rehydrated with the deleted state.
 */
public record NoteDraftDiscardedEvent(String noteId) {}
