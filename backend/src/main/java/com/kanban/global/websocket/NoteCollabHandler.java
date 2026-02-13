package com.kanban.global.websocket;

import com.kanban.domain.note.service.NoteCollabService;
import com.kanban.global.security.JwtProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.BinaryWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Native WebSocket handler for Yjs-based real-time note collaboration.
 *
 * Protocol (custom binary):
 *   Type 0 (MSG_SYNC_FULL)   - Full Y.Doc state for persistence/initial load
 *   Type 1 (MSG_SYNC_UPDATE) - Incremental Y.Doc update (relayed to peers)
 *   Type 2 (MSG_AWARENESS)   - Awareness update: cursors, presence (relayed)
 *
 * Endpoint: /ws-collab/{noteId}?token={jwt}
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NoteCollabHandler extends BinaryWebSocketHandler {

    private final JwtProvider jwtProvider;
    private final NoteCollabService noteCollabService;

    private static final byte MSG_SYNC_FULL = 0;
    private static final byte MSG_SYNC_UPDATE = 1;
    private static final byte MSG_AWARENESS = 2;

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();

    private static class Room {
        final String noteId;
        final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
        volatile byte[] storedState;

        Room(String noteId) {
            this.noteId = noteId;
        }
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String noteId = extractNoteId(session);
        String userId = extractAndValidateUser(session);

        if (noteId == null || userId == null) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }

        session.getAttributes().put("noteId", noteId);
        session.getAttributes().put("userId", userId);

        Room room = rooms.computeIfAbsent(noteId, Room::new);
        room.sessions.put(session.getId(), session);

        // Load stored state from DB for the first session in the room
        if (room.sessions.size() == 1 && room.storedState == null) {
            noteCollabService.loadState(noteId).ifPresent(state -> room.storedState = state);
        }

        // Send stored state to the newly connected client
        if (room.storedState != null && room.storedState.length > 0) {
            byte[] msg = new byte[1 + room.storedState.length];
            msg[0] = MSG_SYNC_FULL;
            System.arraycopy(room.storedState, 0, msg, 1, room.storedState.length);
            session.sendMessage(new BinaryMessage(msg));
        }

        log.debug("Collab connected: noteId={}, userId={}, sessions={}", noteId, userId, room.sessions.size());
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) throws Exception {
        String noteId = (String) session.getAttributes().get("noteId");
        if (noteId == null) return;

        Room room = rooms.get(noteId);
        if (room == null) return;

        ByteBuffer payload = message.getPayload();
        byte[] data = new byte[payload.remaining()];
        payload.get(data);
        if (data.length == 0) return;

        byte msgType = data[0];

        switch (msgType) {
            case MSG_SYNC_FULL -> {
                // Full state snapshot from client → persist
                byte[] state = new byte[data.length - 1];
                System.arraycopy(data, 1, state, 0, state.length);
                room.storedState = state;
                noteCollabService.saveState(noteId, state);
                log.debug("Collab state persisted: noteId={}, size={}", noteId, state.length);
            }
            case MSG_SYNC_UPDATE -> relayToOthers(room, session.getId(), data);
            case MSG_AWARENESS -> relayToOthers(room, session.getId(), data);
            default -> log.warn("Unknown collab message type: {}", msgType);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String noteId = (String) session.getAttributes().get("noteId");
        if (noteId == null) return;

        Room room = rooms.get(noteId);
        if (room == null) return;

        room.sessions.remove(session.getId());
        log.debug("Collab disconnected: noteId={}, remaining={}", noteId, room.sessions.size());

        if (room.sessions.isEmpty()) {
            // Persist final state and clean up room
            if (room.storedState != null && room.storedState.length > 0) {
                try {
                    noteCollabService.saveState(noteId, room.storedState);
                } catch (Exception e) {
                    log.error("Failed to persist collab state on room close: noteId={}", noteId, e);
                }
            }
            rooms.remove(noteId);
            log.debug("Collab room removed: noteId={}", noteId);
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("Collab transport error: sessionId={}", session.getId(), exception);
        try {
            afterConnectionClosed(session, CloseStatus.SERVER_ERROR);
        } catch (Exception e) {
            log.error("Error during cleanup after transport error", e);
        }
    }

    private void relayToOthers(Room room, String senderSessionId, byte[] data) {
        BinaryMessage msg = new BinaryMessage(data);
        room.sessions.forEach((sessionId, ws) -> {
            if (!sessionId.equals(senderSessionId) && ws.isOpen()) {
                try {
                    synchronized (ws) {
                        ws.sendMessage(msg);
                    }
                } catch (IOException e) {
                    log.error("Failed to relay to session: {}", sessionId, e);
                }
            }
        });
    }

    private String extractNoteId(WebSocketSession session) {
        URI uri = session.getUri();
        if (uri == null) return null;
        String path = uri.getPath();
        // /ws-collab/{noteId}
        String prefix = "/ws-collab/";
        if (path != null && path.startsWith(prefix) && path.length() > prefix.length()) {
            return path.substring(prefix.length());
        }
        return null;
    }

    private String extractAndValidateUser(WebSocketSession session) {
        URI uri = session.getUri();
        if (uri == null) return null;

        String query = uri.getQuery();
        if (query == null) return null;

        String token = null;
        for (String param : query.split("&")) {
            String[] kv = param.split("=", 2);
            if (kv.length == 2 && "token".equals(kv[0])) {
                token = kv[1];
                break;
            }
        }

        if (token == null || !jwtProvider.validateToken(token)) {
            log.warn("Invalid JWT for collab WebSocket");
            return null;
        }

        return jwtProvider.getUserIdFromToken(token);
    }
}
