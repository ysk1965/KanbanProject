package com.kanban.global.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;

/**
 * {@code @PreAuthorize} 활성화. 시스템 관리자 전용 컨트롤러(Admin/Monitoring/TestData)가 클래스 레벨
 * {@code @PreAuthorize("hasRole('ADMIN')")} 로 보호된다 — 권한은 {@code UserPrincipal#getAuthorities()} 가
 * systemRole 에서 만든다. URL 레벨 규칙({@code SecurityConfig})과 이중으로 걸려 있다.
 */
@Configuration
@EnableMethodSecurity
public class MethodSecurityConfig {}
