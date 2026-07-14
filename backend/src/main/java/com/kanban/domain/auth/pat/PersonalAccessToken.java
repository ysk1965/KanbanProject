package com.kanban.domain.auth.pat;

import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 개인 액세스 토큰(PAT). 헤드리스 클라이언트(MCP 서버 등)가 사용자를 대신해
 * API를 호출할 때 쓰는 장기 · 폐기 가능 자격증명.
 *
 * <p>원문 토큰은 저장하지 않고 SHA-256 해시(tokenHash)만 보관한다.
 * 발급 시 1회 반환되는 원문을 클라이언트가 보관해야 한다.
 * {@code RefreshToken} 과 달리 사용자 재로그인에 영향받지 않고 개별 폐기된다.
 */
@Entity
@Table(name = "personal_access_tokens")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PersonalAccessToken {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    /** SHA-256(원문 토큰) hex. 조회 키. */
    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    /** UI 표시용 접두부(원문 앞 12자). 원문 복구 불가. */
    @Column(name = "token_prefix", nullable = false, length = 16)
    private String tokenPrefix;

    /** 사용자가 붙인 라벨. */
    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "last_used_at")
    private LocalDateTime lastUsedAt;

    /** null = 만료 없음(수동 폐기까지 유효). */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public boolean isRevoked() {
        return this.revokedAt != null;
    }

    public boolean isExpired() {
        return this.expiresAt != null && LocalDateTime.now(ZoneOffset.UTC).isAfter(this.expiresAt);
    }

    public boolean isActive() {
        return !isRevoked() && !isExpired();
    }

    public void revoke() {
        if (this.revokedAt == null) {
            this.revokedAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    /** 과도한 write를 피하기 위해 1시간 넘게 오래된 경우에만 갱신. */
    public void touchLastUsed() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (this.lastUsedAt == null || this.lastUsedAt.isBefore(now.minusHours(1))) {
            this.lastUsedAt = now;
        }
    }
}
