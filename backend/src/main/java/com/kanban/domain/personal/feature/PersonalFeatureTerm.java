package com.kanban.domain.personal.feature;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 추천 용어 — 사용자가 suggest 열에 적었던 값의 기억.
 *
 * <p>문서 저장 때 서비스가 suggest 열의 값을 뽑아 upsert 한다.
 * 문서 JSON을 검색하지 않으므로 문서가 수백 개여도 추천은 인덱스 한 번이다.
 * 사용자 단위로만 기억하고 다른 사용자에게 새지 않는다.
 */
@Entity
@Table(name = "personal_feature_terms",
        uniqueConstraints = @UniqueConstraint(name = "uq_pft_user_field_value",
                columnNames = {"user_id", "feature_key", "field", "`value`"}),
        indexes = {
                @Index(name = "idx_pft_lookup", columnList = "user_id, feature_key, field, last_used_at")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PersonalFeatureTerm {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "feature_key", nullable = false, length = 40)
    private String featureKey;

    /** 열 이름 ('장소' · '비고' …). 열 key가 아니라 label을 쓴다 — 문서마다 key는 달라도 이름은 같다. */
    @Column(name = "field", nullable = false, length = 60)
    private String field;

    /** H2에서 VALUE가 예약어라 백틱으로 감싼다 — Hibernate가 방언에 맞게 인용하고, PostgreSQL에선 소문자 value와 같다. */
    @Column(name = "`value`", nullable = false, length = 300)
    private String value;

    /** 마지막으로 함께 쓴 색 이름. 없으면 null. */
    @Column(name = "color", length = 16)
    private String color;

    @Column(name = "use_count", nullable = false)
    @Builder.Default
    private Integer useCount = 1;

    @Column(name = "last_used_at", nullable = false)
    private LocalDateTime lastUsedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.lastUsedAt == null) {
            this.lastUsedAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public void touch(String color, LocalDateTime now) {
        this.useCount = this.useCount + 1;
        this.lastUsedAt = now;
        this.color = color;
    }
}
