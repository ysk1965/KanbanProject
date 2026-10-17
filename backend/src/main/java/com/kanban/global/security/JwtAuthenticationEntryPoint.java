package com.kanban.global.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.exception.GlobalExceptionHandler.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 미인증 요청을 401 + 표준 에러 JSON으로 응답한다.
 *
 * Spring Security 기본값(Http403ForbiddenEntryPoint)은 body 없는 403을 내려서,
 * FE가 "만료(A004) → 토큰 갱신" 분기를 태우지 못하고 목업 폴백/무한 대기로 빠졌다.
 * 토큰이 만료였는지(A004) 그 외 무효였는지(A003)는 JwtAuthenticationFilter가
 * 요청 attribute로 남긴 값을 따른다.
 */
@Component
@RequiredArgsConstructor
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {

    /** JwtAuthenticationFilter가 토큰 거절 사유(ErrorCode)를 담아두는 attribute */
    public static final String AUTH_ERROR_ATTR = "com.kanban.auth.errorCode";

    private final ObjectMapper objectMapper;

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        Object attr = request.getAttribute(AUTH_ERROR_ATTR);
        ErrorCode errorCode = attr instanceof ErrorCode ec ? ec : ErrorCode.INVALID_TOKEN;

        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getWriter(), ErrorResponse.of(errorCode));
    }
}
