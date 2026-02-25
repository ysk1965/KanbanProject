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
                        // Public shared content (no auth required)
                        .requestMatchers("/api/v1/public/**").permitAll()
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
