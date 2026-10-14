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
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@Order(0)
@RequiredArgsConstructor
public class MaintenanceFilter extends OncePerRequestFilter {

    /**
     * 점검 모드 캐시 TTL. 매 요청마다 system_config 를 읽던 것을 10초 단위로 묶는다.
     * 같은 인스턴스에서 토글하면 {@link #invalidate()} 로 즉시 반영되고, 다른 인스턴스(prod 2대)는
     * 최대 10초 뒤에 따라온다 — 점검 모드 전환에 10초 지연은 허용 범위.
     */
    private static final long CACHE_TTL_NANOS = TimeUnit.SECONDS.toNanos(10);

    private final SystemConfigRepository systemConfigRepository;
    private final ObjectMapper objectMapper = createMapper();

    /** (읽은 시각, 파싱 결과) 스냅샷. null 이면 아직 읽지 않았거나 무효화된 상태. */
    private volatile CachedInfo cached;

    private record CachedInfo(long readAtNanos, MaintenanceInfo info) {
        boolean isFresh(long nowNanos) {
            return nowNanos - readAtNanos < CACHE_TTL_NANOS;
        }
    }

    /** 점검 모드 토글 직후 호출 — 다음 요청이 DB 값을 다시 읽게 한다. */
    public void invalidate() {
        cached = null;
    }

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
        MaintenanceInfo info = loadInfo();
        return info != null && info.enabled;
    }

    private MaintenanceInfo getMaintenanceInfo() {
        MaintenanceInfo info = loadInfo();
        if (info != null) {
            return info;
        }
        MaintenanceInfo fallback = new MaintenanceInfo();
        fallback.message = "시스템 점검 중입니다";
        return fallback;
    }

    /**
     * 캐시가 신선하면 그대로, 아니면 DB 에서 한 번 읽어 갱신한다.
     * 설정이 없으면 null (= 점검 아님). 읽기 실패 시에도 null 로 두고 캐시하지 않아 다음 요청이 재시도한다.
     */
    private MaintenanceInfo loadInfo() {
        long now = System.nanoTime();
        CachedInfo snapshot = cached;
        if (snapshot != null && snapshot.isFresh(now)) {
            return snapshot.info();
        }
        try {
            Optional<SystemConfig> config = systemConfigRepository.findById("maintenance_mode");
            MaintenanceInfo info = null;
            if (config.isPresent() && config.get().getValue() != null) {
                info = objectMapper.readValue(config.get().getValue(), MaintenanceInfo.class);
            }
            cached = new CachedInfo(now, info);
            return info;
        } catch (Exception e) {
            log.error("Failed to read maintenance info", e);
            return null;
        }
    }

    private static class MaintenanceInfo {
        public boolean enabled;
        public String message;
        public LocalDateTime estimatedEndAt;
        public LocalDateTime startedAt;
    }
}
