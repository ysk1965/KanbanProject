package com.kanban.domain.organization;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "org_onboarding_instances")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrgOnboardingInstance {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private OrganizationMember member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_template_id")
    private OrgOnboardingTemplate sourceTemplate;

    @Column(nullable = false, length = 100)
    private String templateName;

    @Column(nullable = false)
    private int totalItems;

    @Column(nullable = false)
    @Builder.Default
    private int completedItems = 0;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private OnboardingStatus status = OnboardingStatus.IN_PROGRESS;

    @Column(nullable = false)
    private LocalDateTime startedAt;

    private LocalDateTime completedAt;

    private LocalDateTime deletedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "instance", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("displayOrder ASC")
    @Builder.Default
    private List<OrgOnboardingInstanceItem> items = new ArrayList<>();

    @PrePersist
    protected void onCreate() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
        if (this.createdAt == null) this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateProgress(int completedItems) {
        this.completedItems = completedItems;
        if (completedItems >= totalItems) {
            this.status = OnboardingStatus.COMPLETED;
            this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
        } else {
            this.status = OnboardingStatus.IN_PROGRESS;
            this.completedAt = null;
        }
    }

    public void softDelete() {
        this.deletedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public int getProgressPercent() {
        return totalItems > 0 ? (int) Math.round((double) completedItems / totalItems * 100) : 0;
    }
}
