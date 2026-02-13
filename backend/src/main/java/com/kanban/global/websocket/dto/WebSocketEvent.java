package com.kanban.global.websocket.dto;

import java.time.LocalDateTime;

public record WebSocketEvent(
        BoardEventType type,
        String boardId,
        String userId,
        String userName,
        LocalDateTime timestamp,
        Object data
) {

    public static WebSocketEvent of(BoardEventType type, String boardId, String userId, String userName, Object data) {
        return new WebSocketEvent(type, boardId, userId, userName, LocalDateTime.now(java.time.ZoneOffset.UTC), data);
    }
}
