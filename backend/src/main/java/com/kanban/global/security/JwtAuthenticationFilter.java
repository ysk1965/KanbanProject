package com.kanban.global.security;

import com.kanban.domain.auth.pat.PatService;
import com.kanban.domain.user.SystemRole;
import com.kanban.global.exception.ErrorCode;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtProvider jwtProvider;
    /** @Lazy: 필터가 서비스(→JPA)에 이른 시점에 결합되지 않도록. PAT 폴백 시에만 사용. */
    @Lazy
    private final PatService patService;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String token = resolveToken(request);

        if (StringUtils.hasText(token)) {
            UserPrincipal principal = resolvePrincipal(token);
            if (principal != null) {
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(principal, null, Collections.emptyList());
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } else {
                // 거절 사유를 EntryPoint(401 JSON)에 전달 — 만료(A004)면 FE가 갱신을 시도한다
                ErrorCode reason = jwtProvider.isTokenExpired(token)
                        ? ErrorCode.EXPIRED_TOKEN
                        : ErrorCode.INVALID_TOKEN;
                request.setAttribute(JwtAuthenticationEntryPoint.AUTH_ERROR_ATTR, reason);
            }
        }

        filterChain.doFilter(request, response);
    }

    /**
     * Bearer 토큰을 사용자로 해석한다. 먼저 JWT 액세스 토큰으로 시도하고,
     * JWT 가 아니면(=서명/형식 불일치) 개인 액세스 토큰(PAT)으로 폴백한다.
     */
    private UserPrincipal resolvePrincipal(String token) {
        if (jwtProvider.validateAccessToken(token)) {
            String userId = jwtProvider.getUserIdFromToken(token);
            String email = jwtProvider.getEmailFromToken(token);
            SystemRole systemRole = SystemRole.valueOf(jwtProvider.getSystemRoleFromToken(token));
            return new UserPrincipal(userId, email, systemRole);
        }
        return patService.authenticate(token).orElse(null);
    }

    private String resolveToken(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }
}
