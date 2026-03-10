package com.kanban.domain.organization;

import com.kanban.domain.subscription.OrgPlan;
import com.kanban.domain.subscription.OrgSubscription;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "organizations")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Organization {

    @Id
    @Column(length = 36)
    private String id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "logo_url", length = 500)
    private String logoUrl;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    // ── Structure Section Toggles ──
    @Builder.Default
    @Column(name = "departments_enabled", nullable = false)
    private Boolean departmentsEnabled = true;

    @Builder.Default
    @Column(name = "job_groups_enabled", nullable = false)
    private Boolean jobGroupsEnabled = true;

    @Builder.Default
    @Column(name = "positions_enabled", nullable = false)
    private Boolean positionsEnabled = true;

    @Builder.Default
    @Column(name = "titles_enabled", nullable = false)
    private Boolean titlesEnabled = true;

    @Builder.Default
    @Column(name = "grades_enabled", nullable = false)
    private Boolean gradesEnabled = true;

    @Builder.Default
    @Column(name = "hr_system_enabled", nullable = false)
    private Boolean hrSystemEnabled = false;

    @Builder.Default
    @Column(name = "auto_board_access_enabled", nullable = false)
    private Boolean autoBoardAccessEnabled = false;

    @OneToOne(mappedBy = "organization", fetch = FetchType.LAZY)
    private OrgSubscription subscription;

    @Builder.Default
    @Column(name = "trial_used")
    private Boolean trialUsed = false;

    @Column(name = "photo_share_token", unique = true, length = 36)
    private String photoShareToken;

    @Column(name = "photo_upload_token", unique = true, length = 36)
    private String photoUploadToken;

    @Column(name = "photo_upload_token_expires_at")
    private LocalDateTime photoUploadTokenExpiresAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateInfo(String name, String description) {
        if (name != null) {
            this.name = name;
        }
        if (description != null) {
            this.description = description;
        }
    }

    public void updateHrSystemEnabled(Boolean hrSystemEnabled) {
        if (hrSystemEnabled != null) {
            this.hrSystemEnabled = hrSystemEnabled;
        }
    }

    public void updateAutoBoardAccessEnabled(Boolean autoBoardAccessEnabled) {
        if (autoBoardAccessEnabled != null) {
            this.autoBoardAccessEnabled = autoBoardAccessEnabled;
        }
    }

    public void updateLogoUrl(String logoUrl) {
        this.logoUrl = logoUrl;
    }

    public void softDelete() {
        this.deletedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }

    public void restore() {
        this.deletedAt = null;
    }

    public void transferOwnership(User newOwner) {
        this.owner = newOwner;
    }

    public void updateStructureSettings(Boolean departmentsEnabled, Boolean jobGroupsEnabled,
                                         Boolean positionsEnabled, Boolean titlesEnabled, Boolean gradesEnabled) {
        if (departmentsEnabled != null) this.departmentsEnabled = departmentsEnabled;
        if (jobGroupsEnabled != null) this.jobGroupsEnabled = jobGroupsEnabled;
        if (positionsEnabled != null) this.positionsEnabled = positionsEnabled;
        if (titlesEnabled != null) this.titlesEnabled = titlesEnabled;
        if (gradesEnabled != null) this.gradesEnabled = gradesEnabled;
    }

    public boolean hasActiveSubscription() {
        return subscription != null && (subscription.isActive() || subscription.isTrialActive());
    }

    public OrgPlan getCurrentPlan() {
        return subscription != null ? subscription.getPlan() : OrgPlan.FREE;
    }

    public boolean isTrialAvailable() {
        return !Boolean.TRUE.equals(trialUsed);
    }

    public void markTrialUsed() {
        this.trialUsed = true;
    }

    public void enableGalleryShare() {
        if (this.photoShareToken == null) {
            this.photoShareToken = UUID.randomUUID().toString();
        }
    }

    public void disableGalleryShare() {
        this.photoShareToken = null;
    }

    public boolean isGalleryShared() {
        return this.photoShareToken != null;
    }

    public void enableGalleryUpload() {
        this.photoUploadToken = UUID.randomUUID().toString();
        this.photoUploadTokenExpiresAt = LocalDateTime.now(ZoneOffset.UTC).plusWeeks(1);
    }

    public void disableGalleryUpload() {
        this.photoUploadToken = null;
        this.photoUploadTokenExpiresAt = null;
    }

    public boolean isGalleryUploadEnabled() {
        return this.photoUploadToken != null
                && this.photoUploadTokenExpiresAt != null
                && LocalDateTime.now(ZoneOffset.UTC).isBefore(this.photoUploadTokenExpiresAt);
    }
}
