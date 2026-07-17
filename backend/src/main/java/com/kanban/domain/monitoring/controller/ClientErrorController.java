package com.kanban.domain.monitoring.controller;

import com.kanban.domain.monitoring.dto.ClientErrorRequest;
import com.kanban.domain.monitoring.service.ClientErrorService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 클라이언트(FE) 에러 리포트 수집 엔드포인트.
 * - 인증 불필요: 에러는 로그인 전(랜딩/로그인)에도 발생 → /api/v1/public/** (SecurityConfig permitAll).
 * - Sentry가 켜져 있으면 FE는 호출하지 않는다(중복 방지). 미설정 환경의 안전망.
 * - 공개 엔드포인트지만 IP 기반 RateLimitingFilter(600 req/min)로 남용은 자동 방어된다.
 */
@RestController
@RequestMapping("/api/v1/public/client-errors")
@RequiredArgsConstructor
public class ClientErrorController {

    private final ClientErrorService clientErrorService;

    @PostMapping
    public ResponseEntity<Void> report(
            @Valid @RequestBody ClientErrorRequest.Report request,
            HttpServletRequest httpRequest) {
        clientErrorService.record(request, resolveClientIp(httpRequest));
        return ResponseEntity.noContent().build();
    }

    private String resolveClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp;
        }
        return request.getRemoteAddr();
    }
}
