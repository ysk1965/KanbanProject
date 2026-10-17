package com.kanban.global.filter;

import com.kanban.global.websocket.ClientIdHolder;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * X-Client-Id 헤더를 요청 스레드의 ClientIdHolder에 담는다.
 * WebSocket 브로드캐스트가 이 값을 이벤트에 에코해 발신 탭만 self-skip 하게 한다.
 */
@Component
@Order(5)
public class ClientIdFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Client-Id";
    private static final int MAX_LENGTH = 64;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String clientId = request.getHeader(HEADER);
        // 이벤트에 그대로 실려 브로드캐스트되는 값이므로 비정상 길이는 버린다
        if (clientId != null && (clientId.isBlank() || clientId.length() > MAX_LENGTH)) {
            clientId = null;
        }
        try {
            ClientIdHolder.set(clientId);
            filterChain.doFilter(request, response);
        } finally {
            ClientIdHolder.clear();
        }
    }
}
