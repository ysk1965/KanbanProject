package com.kanban.global.websocket;

import com.kanban.global.websocket.dto.BoardEventType;
import com.kanban.global.websocket.dto.WebSocketEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Slf4j
@Service
public class WebSocketEventService {

    private final SimpMessagingTemplate messagingTemplate;
    private final Optional<RedisWebSocketBridge> redisBridge;

    public WebSocketEventService(
            SimpMessagingTemplate messagingTemplate,
            Optional<RedisWebSocketBridge> redisBridge
    ) {
        this.messagingTemplate = messagingTemplate;
        this.redisBridge = redisBridge;
    }

    /**
     * Broadcast an event to all subscribers of a board.
     * Destination: /topic/board/{boardId}
     *
     * @param boardId  the board ID
     * @param type     the event type
     * @param userId   the user who triggered the event (for client-side self-filtering)
     * @param userName the name of the user who triggered the event
     * @param data     the event payload (reuse existing Response DTOs)
     */
    public void sendBoardEvent(String boardId, BoardEventType type, String userId, String userName, Object data) {
        try {
            WebSocketEvent event = WebSocketEvent.of(type, boardId, userId, userName, data);
            String destination = "/topic/board/" + boardId;

            // Deliver to local STOMP subscribers
            messagingTemplate.convertAndSend(destination, event);

            // Relay to other instances via Redis Pub/Sub (prod only)
            redisBridge.ifPresent(bridge -> bridge.publishBoardEvent(boardId, destination, event));

            log.debug("WebSocket event sent: type={}, board={}, user={}", type, boardId, userId);
        } catch (Exception e) {
            // WebSocket failure must not affect business logic
            log.error("Failed to send WebSocket board event: type={}, board={}, error={}", type, boardId, e.getMessage(), e);
        }
    }

    /**
     * Send an event to a specific user within a board context.
     * Destination: /topic/board/{boardId}/user/{userId}
     *
     * @param boardId the board ID
     * @param userId  the target user ID
     * @param type    the event type
     * @param data    the event payload
     */
    public void sendUserEvent(String boardId, String userId, BoardEventType type, Object data) {
        try {
            WebSocketEvent event = WebSocketEvent.of(type, boardId, userId, null, data);
            String destination = "/topic/board/" + boardId + "/user/" + userId;

            messagingTemplate.convertAndSend(destination, event);
            redisBridge.ifPresent(bridge -> bridge.publishUserEvent(userId, destination, event));

            log.debug("WebSocket user event sent: type={}, board={}, targetUser={}", type, boardId, userId);
        } catch (Exception e) {
            // WebSocket failure must not affect business logic
            log.error("Failed to send WebSocket user event: type={}, board={}, user={}, error={}", type, boardId, userId, e.getMessage(), e);
        }
    }

    /**
     * Send a global event to a specific user (not board-scoped).
     * Destination: /topic/user/{userId}
     *
     * @param userId the target user ID
     * @param type   the event type
     * @param data   the event payload
     */
    public void sendGlobalUserEvent(String userId, BoardEventType type, Object data) {
        try {
            WebSocketEvent event = WebSocketEvent.of(type, null, userId, null, data);
            String destination = "/topic/user/" + userId;

            messagingTemplate.convertAndSend(destination, event);
            redisBridge.ifPresent(bridge -> bridge.publishUserEvent(userId, destination, event));

            log.debug("WebSocket global user event sent: type={}, targetUser={}", type, userId);
        } catch (Exception e) {
            log.error("Failed to send WebSocket global user event: type={}, user={}, error={}", type, userId, e.getMessage(), e);
        }
    }
}
