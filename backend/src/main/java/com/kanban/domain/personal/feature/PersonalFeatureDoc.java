package com.kanban.domain.personal.feature;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

/**
 * 마이 스페이스 「기능」 탭의 문서 한 건.
 *
 * <p>기능(feature_key)마다 content 스키마가 다르므로 행·셀을 정규화하지 않고 JSON 한 덩어리로 둔다.
 * 서버는 크기와 소유자만 검증하고 내용은 프런트의 기능 편집기가 책임진다.
 *
 * <p>content 컬럼 타입은 방언에 맡긴다 — PostgreSQL은 jsonb, H2(local)는 json.
 * columnDefinition을 고정하면 한쪽에서 validate/update가 깨진다.
 */
@Entity
@Table(name = "personal_feature_docs", indexes = {
        @Index(name = "idx_pfd_user_feature", columnList = "user_id, feature_key, updated_at")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PersonalFeatureDoc extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "feature_key", nullable = false, length = 40)
    private String featureKey;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "content", nullable = false)
    private Map<String, Object> content;

    @Column(name = "schema_ver", nullable = false)
    @Builder.Default
    private Integer schemaVer = 1;

    /** 소프트 삭제 시각. 30일 뒤 스케줄러가 하드 삭제한다. */
    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateTitle(String title) {
        this.title = title;
    }

    public void updateContent(Map<String, Object> content) {
        this.content = content;
    }

    public void softDelete() {
        this.deletedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }
}
