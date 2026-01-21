package com.kanban.global.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * API 요청에 대한 Rate Limiting을 적용하는 필터
 * IP 주소 기반으로 요청 횟수를 제한합니다.
 */
@Slf4j
@Component
public class RateLimitingFilter extends OncePerRequestFilter {

    // IP별 버킷 저장소
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    // 로그인 엔드포인트용 버킷 (더 엄격한 제한)
    private final Map<String, Bucket> loginBuckets = new ConcurrentHashMap<>();

    // 회원가입 엔드포인트용 버킷 (가장 엄격한 제한)
    private final Map<String, Bucket> signupBuckets = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String clientIp = getClientIp(request);
        String requestUri = request.getRequestURI();

        Bucket bucket = resolveBucket(clientIp, requestUri);

        if (bucket.tryConsume(1)) {
            filterChain.doFilter(request, response);
        } else {
            log.warn("Rate limit exceeded for IP: {} on endpoint: {}", clientIp, requestUri);
            sendRateLimitExceededResponse(response, requestUri);
        }
    }

    /**
     * 요청 URI에 따라 적절한 버킷을 반환
     */
    private Bucket resolveBucket(String clientIp, String requestUri) {
        if (requestUri.contains("/auth/signup")) {
            return signupBuckets.computeIfAbsent(clientIp, this::createSignupBucket);
        } else if (requestUri.contains("/auth/login") || requestUri.contains("/auth/google")) {
            return loginBuckets.computeIfAbsent(clientIp, this::createLoginBucket);
        } else {
            return buckets.computeIfAbsent(clientIp, this::createStandardBucket);
        }
    }

    /**
     * 일반 API용 버킷: 분당 300회, 시간당 3000회
     */
    private Bucket createStandardBucket(String key) {
        return Bucket.builder()
                .addLimit(Bandwidth.classic(300, Refill.greedy(300, Duration.ofMinutes(1))))
                .addLimit(Bandwidth.classic(3000, Refill.greedy(3000, Duration.ofHours(1))))
                .build();
    }

    /**
     * 로그인용 버킷: 분당 5회, 시간당 20회 (브루트포스 방지)
     */
    private Bucket createLoginBucket(String key) {
        return Bucket.builder()
                .addLimit(Bandwidth.classic(5, Refill.greedy(5, Duration.ofMinutes(1))))
                .addLimit(Bandwidth.classic(20, Refill.greedy(20, Duration.ofHours(1))))
                .build();
    }

    /**
     * 회원가입용 버킷: 시간당 5회 (봇 공격 방지)
     */
    private Bucket createSignupBucket(String key) {
        return Bucket.builder()
                .addLimit(Bandwidth.classic(5, Refill.greedy(5, Duration.ofHours(1))))
                .build();
    }

    /**
     * 클라이언트 IP 추출 (프록시 환경 고려)
     */
    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }

        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isEmpty()) {
            return xRealIp;
        }

        return request.getRemoteAddr();
    }

    /**
     * Rate Limit 초과 응답 전송
     */
    private void sendRateLimitExceededResponse(HttpServletResponse response, String requestUri) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");

        String message = getErrorMessage(requestUri);
        String jsonResponse = String.format(
                "{\"status\":429,\"code\":\"R001\",\"message\":\"%s\"}",
                message
        );

        response.getWriter().write(jsonResponse);
    }

    /**
     * 엔드포인트별 에러 메시지
     */
    private String getErrorMessage(String requestUri) {
        if (requestUri.contains("/auth/signup")) {
            return "회원가입 요청이 너무 많습니다. 1시간 후 다시 시도해주세요.";
        } else if (requestUri.contains("/auth/login")) {
            return "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.";
        } else {
            return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        // Health check와 정적 리소스는 Rate Limiting에서 제외
        return path.equals("/health") ||
               path.startsWith("/actuator") ||
               path.startsWith("/h2-console");
    }
}
