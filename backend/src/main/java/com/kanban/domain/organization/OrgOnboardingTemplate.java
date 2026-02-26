package com.kanban.domain.organization;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "org_onboarding_templates")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrgOnboardingTemplate {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 500)
    private String description;

    @Column(nullable = false)
    @Builder.Default
    private boolean autoAssign = true;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_department_id")
    private OrganizationDepartment targetDepartment;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_job_group_id")
    private OrganizationJobGroup targetJobGroup;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(nullable = false)
    @Builder.Default
    private int displayOrder = 0;

    @OneToMany(mappedBy = "template", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("displayOrder ASC")
    @Builder.Default
    private List<OrgOnboardingTemplateItem> items = new ArrayList<>();

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
        if (this.createdAt == null) this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        if (this.updatedAt == null) this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void update(String name, String description, boolean autoAssign,
                       OrganizationDepartment targetDepartment, OrganizationJobGroup targetJobGroup) {
        this.name = name;
        this.description = description;
        this.autoAssign = autoAssign;
        this.targetDepartment = targetDepartment;
        this.targetJobGroup = targetJobGroup;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void deactivate() {
        this.active = false;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}
