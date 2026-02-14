package com.kanban.global.websocket.dto;

/**
 * Message wrapper for Redis Pub/Sub WebSocket relay.
 * Includes instanceId for self-message filtering.
 *
 * @param instanceId source instance UUID (for filtering own messages)
 * @param destination STOMP destination (e.g., /topic/board/{boardId})
 * @param payload serialized WebSocketEvent JSON
 */
public record RedisWsMessage(
        String instanceId,
        String destination,
        String payload
) {
}
