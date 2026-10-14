package com.kanban.global.security;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.kanban.domain.admin.controller.AdminController;
import com.kanban.domain.user.SystemRole;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 시스템 관리자 전용 API 보호: URL 규칙(SecurityConfig) + 메서드 시큐리티(@PreAuthorize) 이중 방어.
 * 토큰은 실제 JwtProvider 로 만들어 JwtAuthenticationFilter 의 ROLE_* 매핑까지 함께 탄다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("관리자 API 접근 제어")
class AdminEndpointSecurityTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    JwtProvider jwtProvider;

    @Autowired
    AdminController adminController;

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    private String bearer(SystemRole role) {
        return "Bearer "
                + jwtProvider.createAccessToken("user-" + role, role.name().toLowerCase() + "@x", role.name());
    }

    @Nested
    @DisplayName("URL 규칙 — /api/v1/admin/**, /api/v1/test/**")
    class UrlRules {

        @Test
        @DisplayName("USER → 403 + AD001 (종전 verifyAdminAccess 와 같은 코드)")
        void userDenied() throws Exception {
            mvc.perform(get("/api/v1/admin/users").header("Authorization", bearer(SystemRole.USER)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("AD001"));
        }

        @Test
        @DisplayName("TESTER → 403 + AD001")
        void testerDenied() throws Exception {
            mvc.perform(get("/api/v1/admin/users").header("Authorization", bearer(SystemRole.TESTER)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("AD001"));
        }

        @Test
        @DisplayName("모니터링(/api/v1/admin/monitoring/**)·테스트 데이터(/api/v1/test/**)도 같은 규칙")
        void monitoringAndTestDataDenied() throws Exception {
            mvc.perform(get("/api/v1/admin/monitoring/alert-config").header("Authorization", bearer(SystemRole.USER)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("AD001"));
            mvc.perform(post("/api/v1/test/create-board").header("Authorization", bearer(SystemRole.USER)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("AD001"));
        }

        @Test
        @DisplayName("ADMIN → 통과 (200)")
        void adminAllowed() throws Exception {
            mvc.perform(get("/api/v1/admin/users").header("Authorization", bearer(SystemRole.ADMIN)))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("토큰 없음 → 401")
        void anonymousUnauthorized() throws Exception {
            mvc.perform(get("/api/v1/admin/users")).andExpect(status().isUnauthorized());
        }
    }

    @Nested
    @DisplayName("메서드 시큐리티 — URL 규칙을 우회해 컨트롤러 빈을 직접 호출")
    class MethodSecurity {

        private void authenticateAs(SystemRole role) {
            UserPrincipal principal = new UserPrincipal("user-" + role, "x@x", role);
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
        }

        @Test
        @DisplayName("USER 권한으로는 @PreAuthorize 가 AccessDeniedException 을 던진다")
        void userDeniedByMethodSecurity() {
            authenticateAs(SystemRole.USER);
            assertThatThrownBy(() -> adminController.getUsers(0, 20, null)).isInstanceOf(AccessDeniedException.class);
        }

        @Test
        @DisplayName("ADMIN 권한이면 통과")
        void adminPassesMethodSecurity() {
            authenticateAs(SystemRole.ADMIN);
            assertThatCode(() -> adminController.getUsers(0, 20, null)).doesNotThrowAnyException();
        }
    }
}
