package com.kanban.global.websocket;

/**
 * 요청을 보낸 클라이언트 탭의 X-Client-Id를 요청 스레드에 보관한다.
 * WebSocketEvent가 브로드캐스트 시 이 값을 에코해, 프론트가
 * "자기 탭이 유발한 이벤트"만 스킵할 수 있게 한다 (user 단위 스킵의 다중 탭 문제 방지).
 * HTTP 요청 밖(스케줄러, 비동기 작업 등)에서는 null이며, 이 경우 모든 탭이 이벤트를 반영한다.
 */
public final class ClientIdHolder {

    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();

    private ClientIdHolder() {
    }

    public static void set(String clientId) {
        CURRENT.set(clientId);
    }

    public static String get() {
        return CURRENT.get();
    }

    public static void clear() {
        CURRENT.remove();
    }
}
