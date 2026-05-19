package com.kanban.global.websocket;

import com.kanban.domain.note.NoteDraftDiscardedEvent;
import com.kanban.domain.note.NoteSnapshotSavedEvent;
import com.kanban.domain.note.service.NoteCollabService;
import com.kanban.global.security.JwtProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.BinaryWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
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
 *
 * In prod (Redis available): relays updates across instances via Redis Pub/Sub.
 * In local/dev (no Redis): local relay only (existing behavior).
 */
@Slf4j
@Component
public class NoteCollabHandler extends BinaryWebSocketHandler {

    private final JwtProvider jwtProvider;
    private final NoteCollabService noteCollabService;
    private final InstanceIdHolder instanceIdHolder;
    private final Optional<StringRedisTemplate> redisTemplate;
    private final Optional<RedisMessageListenerContainer> listenerContainer;

    private static final byte MSG_SYNC_FULL = 0;
    private static final byte MSG_SYNC_UPDATE = 1;
    private static final byte MSG_AWARENESS = 2;
    /** Server → client: a new published snapshot exists; View clients should refetch. */
    private static final byte MSG_SNAPSHOT_UPDATED = 3;

    private static final String REDIS_CHANNEL_PREFIX = "ws-collab:";

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, MessageListener> redisListeners = new ConcurrentHashMap<>();

    public NoteCollabHandler(
            JwtProvider jwtProvider,
            NoteCollabService noteCollabService,
            InstanceIdHolder instanceIdHolder,
            Optional<StringRedisTemplate> wsRedisTemplate,
            Optional<RedisMessageListenerContainer> redisMessageListenerContainer
    ) {
        this.jwtProvider = jwtProvider;
        this.noteCollabService = noteCollabService;
        this.instanceIdHolder = instanceIdHolder;
        this.redisTemplate = wsRedisTemplate;
        this.listenerContainer = redisMessageListenerContainer;
    }

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

        // DB 상태를 먼저 로드한 후 Redis 구독을 시작하여,
        // 구독 시점에 아직 storedState가 비어있는 레이스 윈도우를 제거
        Room room = rooms.computeIfAbsent(noteId, k -> {
            Room newRoom = new Room(k);
            noteCollabService.loadState(k).ifPresent(state -> newRoom.storedState = state);
            subscribeRedisChannel(k);
            return newRoom;
        });
        room.sessions.put(session.getId(), session);

        // Always send a MSG_SYNC_FULL on connect so the client has an unambiguous
        // "initial sync done" signal. Without this, brand-new notes (no stored
        // state) leave the client guessing via an arbitrary timer — which races
        // with user typing and causes the first keystroke to be overwritten when
        // we hydrate from the published snapshot. An empty payload is safe:
        // Y.applyUpdate on a zero-length array is a no-op.
        byte[] state = room.storedState != null ? room.storedState : new byte[0];
        byte[] msg = new byte[1 + state.length];
        msg[0] = MSG_SYNC_FULL;
        if (state.length > 0) {
            System.arraycopy(state, 0, msg, 1, state.length);
        }
        session.sendMessage(new BinaryMessage(msg));

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
            case MSG_SYNC_UPDATE, MSG_AWARENESS -> {
                // Relay to local peers
                relayToOthers(room, session.getId(), data);
                // Relay to other instances via Redis
                publishToRedis(noteId, session.getId(), data);
            }
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
            // Unsubscribe from Redis channel (last local session)
            unsubscribeRedisChannel(noteId);
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

    // --- Snapshot broadcast (server → all clients in the room) ---

    /**
     * Push a {@code MSG_SNAPSHOT_UPDATED} frame to every session in the room.
     * Used when {@link com.kanban.domain.note.NoteService} (or the org variant)
     * persists a manual save: View clients react by refetching note content.
     * Also relayed across instances via Redis so multi-pod deployments work.
     */
    /**
     * When a user discards the draft, clear the room's in-memory storedState.
     * Otherwise the next ws joiner would still be hydrated from the stale
     * cached state and the draft would visibly "resurrect" — even though the
     * DB row was deleted, hasUnpublishedDraft would flip back to true the
     * moment any edit-mode client touched the doc and triggered sendFullState.
     */
    @EventListener
    public void onNoteDraftDiscarded(NoteDraftDiscardedEvent event) {
        Room room = rooms.get(event.noteId());
        if (room != null) {
            room.storedState = null;
        }
    }

    @EventListener
    public void onNoteSnapshotSaved(NoteSnapshotSavedEvent event) {
        String noteId = event.noteId();
        byte[] data = new byte[] { MSG_SNAPSHOT_UPDATED };
        Room room = rooms.get(noteId);
        if (room != null) {
            BinaryMessage msg = new BinaryMessage(data);
            room.sessions.forEach((sessionId, ws) -> {
                if (!ws.isOpen()) return;
                try {
                    synchronized (ws) {
                        ws.sendMessage(msg);
                    }
                } catch (IOException e) {
                    log.error("Failed to push snapshot update to session: {}", sessionId, e);
                }
            });
        }
        publishToRedis(noteId, "snapshot-broadcast", data);
    }

    // --- Redis Pub/Sub ---

    private void publishToRedis(String noteId, String senderSessionId, byte[] data) {
        redisTemplate.ifPresent(template -> {
            try {
                // Format: instanceId|sessionId|base64(binaryData)
                String message = instanceIdHolder.getInstanceId()
                        + "|" + senderSessionId
                        + "|" + Base64.getEncoder().encodeToString(data);
                template.convertAndSend(REDIS_CHANNEL_PREFIX + noteId, message);
            } catch (Exception e) {
                log.error("Failed to publish collab message to Redis: noteId={}", noteId, e);
            }
        });
    }

    private void subscribeRedisChannel(String noteId) {
        listenerContainer.ifPresent(container -> {
            String channel = REDIS_CHANNEL_PREFIX + noteId;
            MessageListener listener = (Message message, byte[] pattern) -> {
                try {
                    String body = new String(message.getBody(), StandardCharsets.UTF_8);
                    String[] parts = body.split("\\|", 3);
                    if (parts.length < 3) return;

                    String sourceInstanceId = parts[0];
                    // Skip messages from this instance
                    if (instanceIdHolder.getInstanceId().equals(sourceInstanceId)) return;

                    byte[] binaryData = Base64.getDecoder().decode(parts[2]);
                    Room room = rooms.get(noteId);
                    if (room == null) return;

                    BinaryMessage msg = new BinaryMessage(binaryData);
                    room.sessions.forEach((sessionId, ws) -> {
                        if (ws.isOpen()) {
                            try {
                                synchronized (ws) {
                                    ws.sendMessage(msg);
                                }
                            } catch (IOException e) {
                                log.error("Failed to relay Redis collab message to session: {}", sessionId, e);
                            }
                        }
                    });
                } catch (Exception e) {
                    log.error("Failed to process Redis collab message: noteId={}", noteId, e);
                }
            };
            container.addMessageListener(listener, new ChannelTopic(channel));
            redisListeners.put(noteId, listener);
            log.debug("Redis subscribed to collab channel: {}", channel);
        });
    }

    private void unsubscribeRedisChannel(String noteId) {
        listenerContainer.ifPresent(container -> {
            MessageListener listener = redisListeners.remove(noteId);
            if (listener != null) {
                container.removeMessageListener(listener, new ChannelTopic(REDIS_CHANNEL_PREFIX + noteId));
                log.debug("Redis unsubscribed from collab channel: {}", REDIS_CHANNEL_PREFIX + noteId);
            }
        });
    }

    // --- Local relay ---

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

        if (token == null || !jwtProvider.validateAccessToken(token)) {
            log.warn("Invalid JWT for collab WebSocket");
            return null;
        }

        return jwtProvider.getUserIdFromToken(token);
    }
}
