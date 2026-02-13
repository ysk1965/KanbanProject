package com.kanban.global.security;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.user.SystemRole;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private final JwtProvider jwtProvider;
    private final BoardRepository boardRepository;

    private static final Pattern BOARD_TOPIC_PATTERN = Pattern.compile("^/topic/board/([^/]+)");

    // 보드 Tier 캐시: boardId → { isStandard, cachedAt }
    private static final long TIER_CACHE_TTL_MS = 5 * 60 * 1000L; // 5분
    private final Map<String, TierCacheEntry> tierCache = new ConcurrentHashMap<>();

    private record TierCacheEntry(boolean isStandard, long cachedAt) {
        boolean isExpired() {
            return System.currentTimeMillis() - cachedAt > TIER_CACHE_TTL_MS;
        }
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            handleConnect(accessor);
        }

        if (accessor != null && StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            handleSubscribe(accessor);
        }

        return message;
    }

    private void handleConnect(StompHeaderAccessor accessor) {
        String token = resolveToken(accessor);

        if (StringUtils.hasText(token) && jwtProvider.validateToken(token)) {
            String userId = jwtProvider.getUserIdFromToken(token);
            String email = jwtProvider.getEmailFromToken(token);
            String systemRoleStr = jwtProvider.getSystemRoleFromToken(token);
            SystemRole systemRole = SystemRole.valueOf(systemRoleStr);

            UserPrincipal principal = new UserPrincipal(userId, email, systemRole);

            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(principal, null, Collections.emptyList());

            accessor.setUser(authentication);

            log.debug("WebSocket CONNECT authenticated: userId={}", userId);
        } else {
            log.warn("WebSocket CONNECT failed: invalid or missing JWT token");
            throw new IllegalArgumentException("Invalid or missing JWT token for WebSocket connection");
        }
    }

    /**
     * SUBSCRIBE 시점에 보드 Tier 체크 (5분 TTL 캐시).
     * STANDARD 보드는 WebSocket 구독을 차단한다.
     */
    private void handleSubscribe(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (destination == null) return;

        Matcher matcher = BOARD_TOPIC_PATTERN.matcher(destination);
        if (matcher.find()) {
            String boardId = matcher.group(1);
            boolean isStandard = isBoardStandard(boardId);
            if (isStandard) {
                log.warn("WebSocket SUBSCRIBE blocked: STANDARD board={}", boardId);
                throw new MessageDeliveryException("Real-time sync is not available for Standard tier boards");
            }
        }
    }

    private boolean isBoardStandard(String boardId) {
        TierCacheEntry cached = tierCache.get(boardId);
        if (cached != null && !cached.isExpired()) {
            return cached.isStandard();
        }
        boolean isStandard = boardRepository.findById(boardId)
                .map(Board::isStandard)
                .orElse(false);
        tierCache.put(boardId, new TierCacheEntry(isStandard, System.currentTimeMillis()));
        return isStandard;
    }

    /**
     * Extract JWT token from STOMP CONNECT frame.
     * Checks Authorization header first, then falls back to token query parameter.
     */
    private String resolveToken(StompHeaderAccessor accessor) {
        // Try Authorization header (native STOMP header)
        List<String> authHeaders = accessor.getNativeHeader("Authorization");
        if (authHeaders != null && !authHeaders.isEmpty()) {
            String bearerToken = authHeaders.get(0);
            if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
                return bearerToken.substring(7);
            }
        }

        // Fallback: try token header directly
        List<String> tokenHeaders = accessor.getNativeHeader("token");
        if (tokenHeaders != null && !tokenHeaders.isEmpty()) {
            return tokenHeaders.get(0);
        }

        return null;
    }
}
