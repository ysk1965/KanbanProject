package com.kanban.global.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.kanban.domain.system.SystemConfig;
import com.kanban.domain.system.SystemConfigRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Component
@Order(0)
@RequiredArgsConstructor
public class MaintenanceFilter extends OncePerRequestFilter {

    private final SystemConfigRepository systemConfigRepository;
    private final ObjectMapper objectMapper = createMapper();

    private static ObjectMapper createMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        return mapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain) throws ServletException, IOException {
        String path = request.getRequestURI();

        // 점검 모드에서도 허용되는 경로들
        if (path.startsWith("/api/v1/system/") ||      // 시스템 상태/공지사항
            path.startsWith("/api/v1/admin/") ||       // 어드민 API
            path.startsWith("/api/v1/auth/") ||        // 인증 API (로그인/회원가입)
            path.startsWith("/api/v1/users/me") ||     // 현재 사용자 정보 (어드민 확인용)
            path.startsWith("/health") ||
            path.startsWith("/actuator")) {
            filterChain.doFilter(request, response);
            return;
        }

        if (isMaintenanceMode()) {
            response.setStatus(HttpStatus.SERVICE_UNAVAILABLE.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");

            MaintenanceInfo info = getMaintenanceInfo();
            Map<String, Object> body = Map.of(
                    "error", Map.of(
                            "code", "SY002",
                            "message", info.message != null ? info.message : "시스템 점검 중입니다",
                            "estimated_end_at", info.estimatedEndAt != null ? info.estimatedEndAt.toString() : ""
                    )
            );
            response.getWriter().write(objectMapper.writeValueAsString(body));
            return;
        }

        filterChain.doFilter(request, response);
    }

    private boolean isMaintenanceMode() {
        try {
            Optional<SystemConfig> config = systemConfigRepository.findById("maintenance_mode");
            if (config.isEmpty() || config.get().getValue() == null) {
                return false;
            }
            MaintenanceInfo info = objectMapper.readValue(config.get().getValue(), MaintenanceInfo.class);
            return info.enabled;
        } catch (Exception e) {
            log.error("Failed to check maintenance mode", e);
            return false;
        }
    }

    private MaintenanceInfo getMaintenanceInfo() {
        try {
            Optional<SystemConfig> config = systemConfigRepository.findById("maintenance_mode");
            if (config.isPresent() && config.get().getValue() != null) {
                return objectMapper.readValue(config.get().getValue(), MaintenanceInfo.class);
            }
        } catch (Exception e) {
            log.error("Failed to read maintenance info", e);
        }
        MaintenanceInfo info = new MaintenanceInfo();
        info.message = "시스템 점검 중입니다";
        return info;
    }

    private static class MaintenanceInfo {
        public boolean enabled;
        public String message;
        public LocalDateTime estimatedEndAt;
        public LocalDateTime startedAt;
    }
}
