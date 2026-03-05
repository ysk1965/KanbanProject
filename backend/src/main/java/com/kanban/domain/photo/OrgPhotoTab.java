package com.kanban.domain.photo;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "org_photo_tabs",
        indexes = {
                @Index(name = "idx_org_photo_tab_org", columnList = "organization_id, sort_order")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrgPhotoTab extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "description", length = 200)
    private String description;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cover_photo_id")
    private OrgPhoto coverPhoto;

    @Column(name = "share_token", length = 36, unique = true)
    private String shareToken;

    @Column(name = "is_shared", nullable = false)
    @Builder.Default
    private Boolean isShared = false;

    @Column(name = "photo_count", nullable = false)
    @Builder.Default
    private int photoCount = 0;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void update(String name, String description) {
        if (name != null) this.name = name;
        if (description != null) this.description = description;
    }

    public void incrementPhotoCount() {
        this.photoCount++;
    }

    public void decrementPhotoCount() {
        if (this.photoCount > 0) {
            this.photoCount--;
        }
    }

    public void updateCoverPhoto(OrgPhoto coverPhoto) {
        this.coverPhoto = coverPhoto;
    }

    public void updateSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public String enableShare() {
        this.isShared = true;
        if (this.shareToken == null) {
            this.shareToken = UUID.randomUUID().toString();
        }
        return this.shareToken;
    }

    public void disableShare() {
        this.isShared = false;
        this.shareToken = null;
    }
}
