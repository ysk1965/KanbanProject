package com.kanban.domain.okr;

import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.OrganizationDepartment;
import com.kanban.domain.organization.OrganizationMember;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "okr_objectives")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class OkrObjective {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cycle_id", nullable = false)
    private OkrCycle cycle;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String level = "COMPANY";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private OrganizationDepartment department;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private OrganizationMember owner;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_objective_id")
    private OkrObjective parentObjective;

    @Column(nullable = false)
    @Builder.Default
    private Integer progress = 0;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String confidence = "ON_TRACK";

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateInfo(String title, String description, String level,
                           OrganizationDepartment department, OrganizationMember owner,
                           OkrObjective parentObjective) {
        if (title != null) {
            this.title = title;
        }
        if (description != null) {
            this.description = description;
        }
        if (level != null) {
            this.level = level;
        }
        this.department = department;
        this.owner = owner;
        this.parentObjective = parentObjective;
    }

    public void updateProgress(Integer progress) {
        if (progress != null) {
            this.progress = progress;
        }
    }

    public void updateConfidence(String confidence) {
        if (confidence != null) {
            this.confidence = confidence;
        }
    }
}
