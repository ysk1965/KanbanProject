package com.kanban.global.config;

import com.kanban.global.security.JwtAuthenticationFilter;
import com.kanban.global.security.RateLimitingFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final RateLimitingFilter rateLimitingFilter;

    @org.springframework.beans.factory.annotation.Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    @org.springframework.beans.factory.annotation.Value("${app.testprod-frontend-url:}")
    private String testprodFrontendUrl;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .headers(headers -> headers
                        .frameOptions(HeadersConfigurer.FrameOptionsConfig::sameOrigin) // H2 Console
                        .contentTypeOptions(contentType -> {}) // X-Content-Type-Options: nosniff
                        .httpStrictTransportSecurity(hsts -> hsts
                                .includeSubDomains(true)
                                .maxAgeInSeconds(31536000) // 1 year
                        )
                        .addHeaderWriter((request, response) -> {
                            response.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
                            response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
                            response.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
                        })
                )
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Public endpoints
                        .requestMatchers("/api/v1/auth/**").permitAll()
                        .requestMatchers("/api/v1/pricing/**").permitAll()
                        .requestMatchers("/api/v1/invites/**").permitAll()
                        .requestMatchers("/api/v1/org-invites/**").permitAll()
                        // Public shared content (no auth required)
                        .requestMatchers("/api/v1/public/**").permitAll()

                        // 자동 보고서 공유 링크 — 토큰만으로 열린다. 만료·무효화는 서비스에서 확인한다.
                        .requestMatchers("/api/v1/reports/share/**").permitAll()
                        // System status (maintenance check, active announcements)
                        .requestMatchers("/api/v1/system/**").permitAll()
                        // Custom icon generated files (S3 proxy)
                        .requestMatchers("/api/v1/customicon/files/**").permitAll()
                        // Local uploaded files (dev)
                        .requestMatchers("/uploads/**").permitAll()
                        // File upload API (인증 필요하지만 multipart 허용)
                        // /api/v1/files/** 는 anyRequest().authenticated()에 의해 보호됨
                        // H2 Console
                        .requestMatchers("/h2-console/**").permitAll()
                        // Polar webhook endpoint (signature verified in service)
                        .requestMatchers("/api/v1/webhooks/polar").permitAll()
                        // Slack App endpoints (OAuth callback, Events API, Slash Commands, Interactive Components)
                        .requestMatchers("/api/v1/slack/oauth/callback").permitAll()
                        .requestMatchers("/api/v1/slack/oauth/user-callback").permitAll()
                        .requestMatchers("/api/v1/slack/events").permitAll()
                        .requestMatchers("/api/v1/slack/interactions").permitAll()
                        .requestMatchers("/api/v1/slack/commands").permitAll()
                        // Discord OAuth callback (state-verified in service)
                        .requestMatchers("/api/v1/discord/oauth/callback").permitAll()
                        // JIRA OAuth callback (HMAC state-verified in service)
                        .requestMatchers("/api/v1/jira/oauth/callback").permitAll()

                        // Confluence OAuth 콜백 — JIRA와 별개의 연결이다
                        .requestMatchers("/api/v1/confluence/oauth/callback").permitAll()
                        // JIRA webhook receiver (per-board secret token verified in service)
                        .requestMatchers("/api/v1/jira/webhook/**").permitAll()
                        // 자동수정 러너 콜백 (보드별 시크릿 토큰을 서비스에서 검증)
                        .requestMatchers("/api/v1/jira/autofix/callback/**").permitAll()
                        // WebSocket endpoints
                        .requestMatchers("/ws/**").permitAll()
                        .requestMatchers("/ws-collab/**").permitAll()
                        // Health check
                        .requestMatchers("/health", "/actuator/**").permitAll()
                        // All other requests require authentication
                        .anyRequest().authenticated()
                )
                .addFilterBefore(rateLimitingFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(jwtAuthenticationFilter, RateLimitingFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        List<String> origins = new ArrayList<>(List.of(frontendUrl, "https://bridgespots.com", "https://www.bridgespots.com", "https://milkyway.pe.kr", "https://www.milkyway.pe.kr", "http://localhost:5173", "http://localhost:5174", "http://localhost:3000", "capacitor://localhost", "http://localhost", "https://localhost"));
        if (testprodFrontendUrl != null && !testprodFrontendUrl.isBlank()) {
            origins.add(testprodFrontendUrl);
        }
        configuration.setAllowedOrigins(origins);
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
