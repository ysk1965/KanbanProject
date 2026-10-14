package com.kanban.global.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.exception.GlobalExceptionHandler.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

/**
 * 인증은 됐지만 권한이 없는 요청을 403 + 표준 에러 JSON으로 응답한다.
 * (기본값은 body 없는 403이라 FE가 인증 실패와 구분할 수 없었다.)
 */
@Component
@RequiredArgsConstructor
public class JwtAccessDeniedHandler implements AccessDeniedHandler {

    private final ObjectMapper objectMapper;

    @Override
    public void handle(
            HttpServletRequest request, HttpServletResponse response, AccessDeniedException accessDeniedException)
            throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        // 관리자 전용 경로는 종전 verifyAdminAccess 와 같은 AD001 을 유지한다 (FE 호환)
        ErrorCode code = AdminPaths.isAdminOnly(request.getRequestURI())
                ? ErrorCode.ADMIN_ACCESS_DENIED
                : ErrorCode.ACCESS_DENIED;
        objectMapper.writeValue(response.getWriter(), ErrorResponse.of(code));
    }
}
