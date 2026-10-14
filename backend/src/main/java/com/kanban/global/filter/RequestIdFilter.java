package com.kanban.global.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 요청 상관 ID(X-Request-Id)를 MDC 에 싣고 응답 헤더로 되돌려 준다.
 *
 * <p>클라이언트/ALB 가 보낸 값이 있으면 그대로 쓰고(형식이 어긋나면 버린다), 없으면 짧은 UUID 를 만든다.
 * 모든 필터보다 먼저 실행되어야 이후 필터·컨트롤러·예외 핸들러 로그에 ID 가 붙는다.
 * MDC 는 스레드에 묶이므로 요청이 끝나면 반드시 지운다(스레드 풀 재사용 시 오염 방지).
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Request-Id";
    public static final String MDC_KEY = "requestId";

    /** 로그/헤더에 그대로 실리는 값이라 허용 문자와 길이를 제한한다. */
    private static final int MAX_LENGTH = 64;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String requestId = sanitize(request.getHeader(HEADER));
        if (requestId == null) {
            requestId = generate();
        }
        try {
            MDC.put(MDC_KEY, requestId);
            response.setHeader(HEADER, requestId);
            filterChain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }

    /** 현재 요청의 상관 ID. 필터 밖(스케줄러 등)에서는 null. */
    public static String current() {
        return MDC.get(MDC_KEY);
    }

    static String sanitize(String raw) {
        if (raw == null) return null;
        String value = raw.trim();
        if (value.isEmpty() || value.length() > MAX_LENGTH) return null;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            boolean ok = (c >= '0' && c <= '9')
                    || (c >= 'a' && c <= 'z')
                    || (c >= 'A' && c <= 'Z')
                    || c == '-'
                    || c == '_'
                    || c == '.';
            if (!ok) return null;
        }
        return value;
    }

    /** UUID 앞 16자리 — 로그에서 눈으로 맞춰 보기 충분하고 한 줄을 덜 차지한다. */
    static String generate() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }
}
