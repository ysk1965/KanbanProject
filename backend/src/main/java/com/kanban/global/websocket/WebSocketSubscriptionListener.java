package com.kanban.global.websocket;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;
import org.springframework.web.socket.messaging.SessionUnsubscribeEvent;

import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * STOMP 세션 이벤트 리스너 - Redis Pub/Sub 채널 구독 수명 관리
 *
 * STOMP 클라이언트가 /topic/board/{boardId} 또는 /topic/user/{userId}를 구독하면
 * RedisWebSocketBridge의 해당 Redis 채널 구독을 활성화합니다.
 * 클라이언트 연결이 끊기면 Redis 채널 구독을 해제합니다.
 *
 * Redis Pub/Sub는 구독자가 없으면 메시지를 버리므로,
 * 이 리스너가 없으면 멀티 인스턴스 간 메시지 릴레이가 작동하지 않습니다.
 */
@Slf4j
@Component
public class WebSocketSubscriptionListener {

    private final Optional<RedisWebSocketBridge> redisBridge;

    private static final Pattern BOARD_TOPIC_PATTERN = Pattern.compile("^/topic/board/([^/]+)");
    private static final Pattern USER_TOPIC_PATTERN = Pattern.compile("^/topic/user/([^/]+)$");

    // 세션별 구독 추적 (disconnect 시 정리용)
    private final Map<String, Set<String>> sessionBoardIds = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> sessionUserIds = new ConcurrentHashMap<>();
    // STOMP subscriptionId → destination 매핑 (unsubscribe 시 destination 역추적용)
    private final Map<String, String> subscriptionDestinations = new ConcurrentHashMap<>();

    public WebSocketSubscriptionListener(Optional<RedisWebSocketBridge> redisBridge) {
        this.redisBridge = redisBridge;
    }

    @EventListener
    public void handleSubscribe(SessionSubscribeEvent event) {
        if (redisBridge.isEmpty()) return;

        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String destination = accessor.getDestination();
        String sessionId = accessor.getSessionId();
        String subscriptionId = accessor.getSubscriptionId();

        if (destination == null || sessionId == null) return;

        // subscriptionId → destination 매핑 저장
        if (subscriptionId != null) {
            subscriptionDestinations.put(sessionId + ":" + subscriptionId, destination);
        }

        RedisWebSocketBridge bridge = redisBridge.get();

        // /topic/board/{boardId} 또는 /topic/board/{boardId}/user/{userId}
        Matcher boardMatcher = BOARD_TOPIC_PATTERN.matcher(destination);
        if (boardMatcher.find()) {
            String boardId = boardMatcher.group(1);
            sessionBoardIds.computeIfAbsent(sessionId, k -> ConcurrentHashMap.newKeySet()).add(boardId);
            bridge.subscribeBoardChannel(boardId);
            log.debug("Redis board channel subscribed via STOMP: sessionId={}, boardId={}", sessionId, boardId);
        }

        // /topic/user/{userId} (전역 사용자 이벤트)
        Matcher userMatcher = USER_TOPIC_PATTERN.matcher(destination);
        if (userMatcher.find()) {
            String userId = userMatcher.group(1);
            sessionUserIds.computeIfAbsent(sessionId, k -> ConcurrentHashMap.newKeySet()).add(userId);
            bridge.subscribeUserChannel(userId);
            log.debug("Redis user channel subscribed via STOMP: sessionId={}, userId={}", sessionId, userId);
        }
    }

    @EventListener
    public void handleUnsubscribe(SessionUnsubscribeEvent event) {
        if (redisBridge.isEmpty()) return;

        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();
        String subscriptionId = accessor.getSubscriptionId();

        if (sessionId == null || subscriptionId == null) return;

        String destination = subscriptionDestinations.remove(sessionId + ":" + subscriptionId);
        if (destination == null) return;

        RedisWebSocketBridge bridge = redisBridge.get();

        Matcher boardMatcher = BOARD_TOPIC_PATTERN.matcher(destination);
        if (boardMatcher.find()) {
            String boardId = boardMatcher.group(1);
            bridge.unsubscribeBoardChannel(boardId);
            Set<String> boards = sessionBoardIds.get(sessionId);
            if (boards != null) boards.remove(boardId);
        }

        Matcher userMatcher = USER_TOPIC_PATTERN.matcher(destination);
        if (userMatcher.find()) {
            String userId = userMatcher.group(1);
            bridge.unsubscribeUserChannel(userId);
            Set<String> users = sessionUserIds.get(sessionId);
            if (users != null) users.remove(userId);
        }
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        if (redisBridge.isEmpty()) return;

        String sessionId = event.getSessionId();
        RedisWebSocketBridge bridge = redisBridge.get();

        // 이 세션의 모든 보드 Redis 구독 해제
        Set<String> boards = sessionBoardIds.remove(sessionId);
        if (boards != null) {
            boards.forEach(boardId -> {
                bridge.unsubscribeBoardChannel(boardId);
                log.debug("Redis board channel unsubscribed on disconnect: sessionId={}, boardId={}", sessionId, boardId);
            });
        }

        // 이 세션의 모든 사용자 Redis 구독 해제
        Set<String> users = sessionUserIds.remove(sessionId);
        if (users != null) {
            users.forEach(userId -> {
                bridge.unsubscribeUserChannel(userId);
                log.debug("Redis user channel unsubscribed on disconnect: sessionId={}, userId={}", sessionId, userId);
            });
        }

        // 이 세션의 subscription 매핑 정리
        subscriptionDestinations.keySet().removeIf(key -> key.startsWith(sessionId + ":"));
    }
}
