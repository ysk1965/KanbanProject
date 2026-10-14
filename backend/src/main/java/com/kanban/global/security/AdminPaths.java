package com.kanban.global.security;

import org.springframework.util.AntPathMatcher;

/**
 * 시스템 관리자 전용 URL 패턴. {@code SecurityConfig} 의 URL 규칙과, 거부 응답 코드를 고르는
 * {@code JwtAccessDeniedHandler}/{@code GlobalExceptionHandler} 가 같은 목록을 본다
 * (관리자 경로 거부는 종전과 같은 {@code AD001}, 그 외는 {@code C003}).
 */
public final class AdminPaths {

    /** {@code /api/v1/admin/**} 는 MonitoringController({@code /api/v1/admin/monitoring}) 도 덮는다. */
    public static final String[] PATTERNS = {"/api/v1/admin/**", "/api/v1/test/**"};

    private static final AntPathMatcher MATCHER = new AntPathMatcher();

    private AdminPaths() {}

    public static boolean isAdminOnly(String requestUri) {
        if (requestUri == null) {
            return false;
        }
        for (String pattern : PATTERNS) {
            if (MATCHER.match(pattern, requestUri)) {
                return true;
            }
        }
        return false;
    }
}
