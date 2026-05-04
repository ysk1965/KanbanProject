package com.kanban.domain.photo;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "photo_share_links",
        indexes = {
                @Index(name = "idx_psl_org_active", columnList = "organization_id"),
                @Index(name = "idx_psl_tab_active", columnList = "tab_id")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PhotoShareLink extends BaseTimeEntity {

    public enum LinkType {
        VIEW,
        UPLOAD
    }

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tab_id")
    private OrgPhotoTab tab;

    @Enumerated(EnumType.STRING)
    @Column(name = "link_type", nullable = false, length = 20)
    private LinkType linkType;

    @Column(name = "token", nullable = false, length = 36, unique = true)
    private String token;

    @Column(name = "title", length = 100)
    private String title;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "revoked_by")
    private User revokedBy;

    @Column(name = "last_accessed_at")
    private LocalDateTime lastAccessedAt;

    @Column(name = "access_count", nullable = false)
    @Builder.Default
    private int accessCount = 0;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.token == null) {
            this.token = UUID.randomUUID().toString();
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

    public void revoke(User user) {
        if (this.revokedAt == null) {
            this.revokedAt = LocalDateTime.now(ZoneOffset.UTC);
            this.revokedBy = user;
        }
    }

    public void recordAccess() {
        this.lastAccessedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.accessCount++;
    }

    public void updateTitle(String title) {
        this.title = title;
    }
}
