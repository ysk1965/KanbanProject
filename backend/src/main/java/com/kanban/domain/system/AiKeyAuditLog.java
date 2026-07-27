package com.kanban.domain.system;

import com.kanban.global.config.AiProviderType;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * AI API 키 관리 감사 로그 (append-only).
 *
 * <p><b>키 원문은 절대 담지 않는다.</b> {@code maskedKey}에는 마스킹된 표기만 남는다.
 */
@Entity
@Table(name = "ai_key_audit_log")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AiKeyAuditLog {

    public enum Action {
        /** 키 교체 */
        ROTATE,
        /** 현재 키 유효성 확인 */
        VERIFY
    }

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false, length = 20)
    private AiProviderType provider;

    @Enumerated(EnumType.STRING)
    @Column(name = "action", nullable = false, length = 20)
    private Action action;

    @Column(name = "actor_user_id", length = 36)
    private String actorUserId;

    @Column(name = "actor_email")
    private String actorEmail;

    /** 마스킹된 키 표기. 원문 아님. */
    @Column(name = "masked_key", length = 64)
    private String maskedKey;

    @Column(name = "success", nullable = false)
    private boolean success;

    @Column(name = "detail", length = 500)
    private String detail;

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
}
