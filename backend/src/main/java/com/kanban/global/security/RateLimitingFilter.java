package com.kanban.global.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * API 요청에 대한 Rate Limiting을 적용하는 필터
 * 인증된 사용자는 userId 기반, 미인증 요청은 IP 기반으로 제한합니다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RateLimitingFilter extends OncePerRequestFilter {

    private final JwtProvider jwtProvider;

    // 일반 API용 버킷 (userId 또는 IP 기반)
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    // 로그인 엔드포인트용 버킷 (IP 기반, 더 엄격한 제한)
    private final Map<String, Bucket> loginBuckets = new ConcurrentHashMap<>();

    // 회원가입 엔드포인트용 버킷 (IP 기반, 가장 엄격한 제한)
    private final Map<String, Bucket> signupBuckets = new ConcurrentHashMap<>();

    // 초대 링크 공개 엔드포인트용 버킷 (IP 기반, 브루트포스 방지)
    private final Map<String, Bucket> inviteBuckets = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String requestUri = request.getRequestURI();
        String bucketKey = resolveBucketKey(request, requestUri);

        Bucket bucket = resolveBucket(bucketKey, requestUri);

        if (bucket.tryConsume(1)) {
            filterChain.doFilter(request, response);
        } else {
            log.warn("Rate limit exceeded for key: {} on endpoint: {}", bucketKey, requestUri);
            sendRateLimitExceededResponse(response, requestUri);
        }
    }

    /**
     * 버킷 키 결정: 인증된 사용자는 userId, 미인증은 IP
     */
    private String resolveBucketKey(HttpServletRequest request, String requestUri) {
        // 로그인/회원가입/공개 초대 링크는 항상 IP 기반
        if (requestUri.contains("/auth/login") || requestUri.contains("/auth/google") || requestUri.contains("/auth/signup")) {
            return "ip:" + getClientIp(request);
        }
        if (requestUri.contains("/org-invites/")) {
            return "ip:" + getClientIp(request);
        }

        // JWT 토큰에서 userId 추출 시도
        String token = resolveToken(request);
        if (StringUtils.hasText(token)) {
            try {
                String userId = jwtProvider.getUserIdFromToken(token);
                if (StringUtils.hasText(userId)) {
                    return "user:" + userId;
                }
            } catch (Exception e) {
                // 토큰 파싱 실패 시 IP 기반 폴백
            }
        }

        return "ip:" + getClientIp(request);
    }

    /**
     * Authorization 헤더에서 JWT 토큰 추출
     */
    private String resolveToken(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }

    /**
     * 요청 URI에 따라 적절한 버킷을 반환
     */
    private Bucket resolveBucket(String bucketKey, String requestUri) {
        if (requestUri.contains("/auth/signup")) {
            return signupBuckets.computeIfAbsent(bucketKey, this::createSignupBucket);
        } else if (requestUri.contains("/auth/login") || requestUri.contains("/auth/google")) {
            return loginBuckets.computeIfAbsent(bucketKey, this::createLoginBucket);
        } else if (requestUri.contains("/org-invites/")) {
            return inviteBuckets.computeIfAbsent(bucketKey, this::createInviteBucket);
        } else {
            return buckets.computeIfAbsent(bucketKey, this::createStandardBucket);
        }
    }

    /**
     * 일반 API용 버킷: 분당 600회, 시간당 6000회
     */
    private Bucket createStandardBucket(String key) {
        return Bucket.builder()
                .addLimit(Bandwidth.classic(600, Refill.greedy(600, Duration.ofMinutes(1))))
                .addLimit(Bandwidth.classic(6000, Refill.greedy(6000, Duration.ofHours(1))))
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
     * 초대 링크 공개 엔드포인트용 버킷: 분당 30회, 시간당 100회 (브루트포스 방지)
     */
    private Bucket createInviteBucket(String key) {
        return Bucket.builder()
                .addLimit(Bandwidth.classic(30, Refill.greedy(30, Duration.ofMinutes(1))))
                .addLimit(Bandwidth.classic(100, Refill.greedy(100, Duration.ofHours(1))))
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
        } else if (requestUri.contains("/org-invites/")) {
            return "초대 링크 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
        } else {
            return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        // Health check, 정적 리소스, Admin 엔드포인트는 Rate Limiting에서 제외
        // Admin 엔드포인트는 인증 + 역할 검증으로 보호됨
        return path.equals("/health") ||
               path.startsWith("/actuator") ||
               path.startsWith("/h2-console") ||
               path.startsWith("/api/v1/admin");
    }
}
