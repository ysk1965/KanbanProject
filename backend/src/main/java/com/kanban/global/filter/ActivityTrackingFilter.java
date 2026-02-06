package com.kanban.global.filter;

import com.kanban.domain.user.UserRepository;
import com.kanban.global.security.UserPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
@Order(10)
@RequiredArgsConstructor
public class ActivityTrackingFilter extends OncePerRequestFilter {

    private final UserRepository userRepository;

    private static final long THROTTLE_MINUTES = 5;
    private final ConcurrentHashMap<String, LocalDateTime> lastUpdatedMap = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain) throws ServletException, IOException {
        try {
            filterChain.doFilter(request, response);
        } finally {
            trackActivity();
        }
    }

    private void trackActivity() {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof UserPrincipal)) {
                return;
            }

            String userId = ((UserPrincipal) auth.getPrincipal()).getUserId();
            LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);

            LocalDateTime lastUpdated = lastUpdatedMap.get(userId);
            if (lastUpdated != null && lastUpdated.plusMinutes(THROTTLE_MINUTES).isAfter(now)) {
                return;
            }

            lastUpdatedMap.put(userId, now);
            userRepository.updateLastActiveAt(userId, now);
        } catch (Exception e) {
            log.debug("Failed to track user activity", e);
        }
    }
}
