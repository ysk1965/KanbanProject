package com.kanban.domain.note;

/**
 * Published when a manual "save" creates a new {@link NoteVersion} snapshot.
 * Listeners (e.g. the collab WebSocket handler) push the event to View-mode
 * clients so they can refetch {@code notes.content} and surface the new state.
 */
public record NoteSnapshotSavedEvent(String noteId) {}
