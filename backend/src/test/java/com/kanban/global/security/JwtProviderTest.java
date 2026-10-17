package com.kanban.global.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.Environment;
import org.springframework.test.util.ReflectionTestUtils;

@DisplayName("JwtProvider — 토큰 생성/검증, insecure 기본 시크릿 가드")
class JwtProviderTest {

    private static final String SECRET = "unit-test-jwt-secret-key-with-enough-length-for-hmac-sha256-0123456789";
    private static final String OTHER_SECRET = "another-jwt-secret-key-with-enough-length-for-hmac-sha256-9876543210zz";
    private static final String INSECURE_DEFAULT =
            "your-super-secret-jwt-key-for-development-only-change-in-production";

    private static JwtProvider provider(String secret, String[] profiles, long accessMs, long refreshMs) {
        Environment env = mock(Environment.class);
        when(env.getActiveProfiles()).thenReturn(profiles);
        JwtProvider p = new JwtProvider(env);
        ReflectionTestUtils.setField(p, "secretKeyString", secret);
        ReflectionTestUtils.setField(p, "accessExpiration", accessMs);
        ReflectionTestUtils.setField(p, "refreshExpiration", refreshMs);
        p.init();
        return p;
    }

    private JwtProvider jwt;

    @BeforeEach
    void setUp() {
        jwt = provider(SECRET, new String[] {"local"}, 60_000L, 600_000L);
    }

    @Nested
    @DisplayName("생성 ↔ 파싱 라운드트립")
    class RoundTrip {

        @Test
        @DisplayName("access 토큰의 subject/email/systemRole/type 이 그대로 복원된다")
        void accessTokenRoundTrip() {
            String token = jwt.createAccessToken("user-1", "a@b.com", "ADMIN");

            assertThat(jwt.validateToken(token)).isTrue();
            assertThat(jwt.getUserIdFromToken(token)).isEqualTo("user-1");
            assertThat(jwt.getEmailFromToken(token)).isEqualTo("a@b.com");
            assertThat(jwt.getSystemRoleFromToken(token)).isEqualTo("ADMIN");
            assertThat(jwt.getTokenType(token)).isEqualTo(JwtProvider.TOKEN_TYPE_ACCESS);
        }

        @Test
        @DisplayName("refresh 토큰은 type=refresh 로 발급된다")
        void refreshTokenRoundTrip() {
            String token = jwt.createRefreshToken("user-1", "a@b.com", "USER");

            assertThat(jwt.getTokenType(token)).isEqualTo(JwtProvider.TOKEN_TYPE_REFRESH);
            assertThat(jwt.getUserIdFromToken(token)).isEqualTo("user-1");
        }

        @Test
        @DisplayName("systemRole 클레임이 없으면 USER 로 폴백한다")
        void systemRoleFallsBackToUser() {
            String token = jwt.createAccessToken("user-1", "a@b.com", null);

            assertThat(jwt.getSystemRoleFromToken(token)).isEqualTo("USER");
        }

        @Test
        @DisplayName("같은 입력이라도 jti 가 달라 두 토큰은 서로 다르다")
        void tokensCarryUniqueId() {
            String t1 = jwt.createAccessToken("user-1", "a@b.com", "USER");
            String t2 = jwt.createAccessToken("user-1", "a@b.com", "USER");

            assertThat(t1).isNotEqualTo(t2);
        }
    }

    @Nested
    @DisplayName("토큰 타입 구분")
    class TokenType {

        @Test
        @DisplayName("validateAccessToken 은 refresh 토큰을 거부한다")
        void accessValidatorRejectsRefresh() {
            String refresh = jwt.createRefreshToken("u", "e", "USER");
            String access = jwt.createAccessToken("u", "e", "USER");

            assertThat(jwt.validateAccessToken(access)).isTrue();
            assertThat(jwt.validateAccessToken(refresh)).isFalse();
        }

        @Test
        @DisplayName("validateRefreshToken 은 access 토큰을 거부한다")
        void refreshValidatorRejectsAccess() {
            String refresh = jwt.createRefreshToken("u", "e", "USER");
            String access = jwt.createAccessToken("u", "e", "USER");

            assertThat(jwt.validateRefreshToken(refresh)).isTrue();
            assertThat(jwt.validateRefreshToken(access)).isFalse();
        }
    }

    @Nested
    @DisplayName("거부 케이스")
    class Rejection {

        @Test
        @DisplayName("만료된 토큰은 validate=false, isTokenExpired=true")
        void expiredTokenRejected() {
            JwtProvider expiring = provider(SECRET, new String[] {"local"}, -1_000L, -1_000L);
            String token = expiring.createAccessToken("u", "e", "USER");

            assertThat(expiring.validateToken(token)).isFalse();
            assertThat(expiring.validateAccessToken(token)).isFalse();
            assertThat(expiring.isTokenExpired(token)).isTrue();
        }

        @Test
        @DisplayName("다른 시크릿으로 서명된 토큰은 거부되고, 만료로 오인하지 않는다")
        void wrongSignatureRejected() {
            JwtProvider other = provider(OTHER_SECRET, new String[] {"local"}, 60_000L, 600_000L);
            String foreign = other.createAccessToken("u", "e", "USER");

            assertThat(jwt.validateToken(foreign)).isFalse();
            assertThat(jwt.isTokenExpired(foreign)).isFalse();
        }

        @Test
        @DisplayName("변조된 페이로드는 거부된다")
        void tamperedPayloadRejected() {
            String token = jwt.createAccessToken("u", "e", "USER");
            String[] parts = token.split("\\.");
            String tampered = parts[0] + "." + parts[1].substring(0, parts[1].length() - 2) + "ab." + parts[2];

            assertThat(jwt.validateToken(tampered)).isFalse();
        }

        @Test
        @DisplayName("형식이 깨진 문자열/빈 문자열은 예외 없이 false")
        void malformedTokenRejected() {
            assertThat(jwt.validateToken("not.a.jwt")).isFalse();
            assertThat(jwt.validateToken("")).isFalse();
            assertThat(jwt.isTokenExpired("garbage")).isFalse();
        }
    }

    @Nested
    @DisplayName("insecure 기본 시크릿 가드")
    class InsecureDefaultGuard {

        @Test
        @DisplayName("prod + 기본 시크릿 → 기동 실패(IllegalStateException)")
        void prodWithDefaultSecretThrows() {
            assertThatThrownBy(() -> provider(INSECURE_DEFAULT, new String[] {"prod"}, 1L, 1L))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("JWT_SECRET");
        }

        @Test
        @DisplayName("dev + 기본 시크릿도 기동 실패")
        void devWithDefaultSecretThrows() {
            assertThatThrownBy(() -> provider(INSECURE_DEFAULT, new String[] {"dev"}, 1L, 1L))
                    .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("local + 기본 시크릿은 경고만 하고 정상 동작한다")
        void localWithDefaultSecretOnlyWarns() {
            assertThatCode(() -> {
                        JwtProvider p = provider(INSECURE_DEFAULT, new String[] {"local"}, 60_000L, 60_000L);
                        String token = p.createAccessToken("u", "e", "USER");
                        assertThat(p.validateAccessToken(token)).isTrue();
                    })
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("prod + 제대로 된 시크릿은 통과한다")
        void prodWithRealSecretPasses() {
            assertThatCode(() -> provider(SECRET, new String[] {"prod"}, 1L, 1L))
                    .doesNotThrowAnyException();
        }
    }

    @Test
    @DisplayName("getRefreshExpiration 은 설정값을 그대로 돌려준다")
    void refreshExpirationExposed() {
        assertThat(jwt.getRefreshExpiration()).isEqualTo(600_000L);
    }
}
