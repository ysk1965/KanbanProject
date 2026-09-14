import { useCallback, useEffect, useState } from "react";
import {
  noteCommentService,
  orgNoteCommentService,
  myNoteCommentService,
} from "../utils/services";
import { wsManager } from "../utils/websocket";
import { CLIENT_ID } from "../utils/clientId";
import type { BoardWebSocketEvent } from "../types";
import type { NoteCommentDetail } from "../utils/api";

const NOTE_COMMENT_EVENTS = new Set([
  "NOTE_COMMENT_CREATED",
  "NOTE_COMMENT_UPDATED",
  "NOTE_COMMENT_DELETED",
  "NOTE_COMMENT_RESOLVED",
  "NOTE_COMMENT_REACTION_TOGGLED",
]);

export interface NoteCommentScope {
  boardId?: string;
  orgId?: string;
  personal?: boolean;
}

/** Pick the comment service + scope id for a note, mirroring NoteCommentSidebar. */
export function resolveNoteCommentScope({ boardId, orgId, personal }: NoteCommentScope) {
  const svc = personal
    ? myNoteCommentService
    : orgId
      ? orgNoteCommentService
      : noteCommentService;
  const scopeId = personal ? "me" : boardId || orgId || "";
  return { svc, scopeId };
}

/** WS topic carrying NOTE_COMMENT_* events for this note (see NoteCommentSidebar). */
function commentTopic({ boardId, orgId, personal }: NoteCommentScope, noteId: string) {
  if (personal) return `/topic/note/${noteId}`;
  if (orgId) return `/topic/org/${orgId}`;
  return `/topic/board/${boardId}`;
}

/**
 * Root comment threads for a note, kept fresh over WebSocket. Used by the
 * editor itself (inline memo highlights must render even when the comments
 * panel is closed); the panel keeps its own copy for its list UI.
 */
export function useNoteCommentThreads(scope: NoteCommentScope, noteId: string) {
  const { svc, scopeId } = resolveNoteCommentScope(scope);
  const topic = commentTopic(scope, noteId);
  const [threads, setThreads] = useState<NoteCommentDetail[]>([]);

  const reload = useCallback(async () => {
    try {
      const data = await svc.getComments(scopeId, noteId);
      setThreads(data.threads ?? []);
    } catch (err) {
      console.error("Failed to load note comment threads:", err);
    }
  }, [svc, scopeId, noteId]);

  useEffect(() => {
    setThreads([]);
    reload();
  }, [reload]);

  useEffect(() => {
    const sub = wsManager.subscribe(topic, (message) => {
      try {
        const event: BoardWebSocketEvent = JSON.parse(message.body);
        if (!NOTE_COMMENT_EVENTS.has(event.type)) return;
        if (event.client_id && event.client_id === CLIENT_ID) return;
        const data = event.data as { note_id?: string };
        if (data?.note_id !== noteId) return;
        reload();
      } catch {
        /* ignore malformed frames */
      }
    });
    return () => sub.unsubscribe();
  }, [topic, noteId, reload]);

  return { threads, reload, svc, scopeId };
}
