package com.kanban.global.websocket.dto;

import com.kanban.global.websocket.ClientIdHolder;

import java.time.LocalDateTime;

public record WebSocketEvent(
        BoardEventType type,
        String boardId,
        String userId,
        String userName,
        // 이벤트를 유발한 요청의 X-Client-Id 에코 — 발신 탭만 self-skip 하기 위한 값.
        // HTTP 요청 밖(스케줄러/비동기)에서 만든 이벤트는 null.
        String clientId,
        LocalDateTime timestamp,
        Object data
) {

    public static WebSocketEvent of(BoardEventType type, String boardId, String userId, String userName, Object data) {
        return new WebSocketEvent(type, boardId, userId, userName, ClientIdHolder.get(),
                LocalDateTime.now(java.time.ZoneOffset.UTC), data);
    }
}
