package com.kanban.domain.organization;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "organization_member_histories")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class OrgMemberHistory {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private OrganizationMember member;

    @Column(name = "department_id", length = 36)
    private String departmentId;

    @Column(name = "department_name", length = 200)
    private String departmentName;

    @Column(name = "position_id", length = 36)
    private String positionId;

    @Column(name = "position_name", length = 100)
    private String positionName;

    @Column(name = "title_id", length = 36)
    private String titleId;

    @Column(name = "title_name", length = 100)
    private String titleName;

    @Column(name = "grade_id", length = 36)
    private String gradeId;

    @Column(name = "grade_name", length = 100)
    private String gradeName;

    @Column(name = "job_group_id", length = 36)
    private String jobGroupId;

    @Column(name = "job_group_name", length = 100)
    private String jobGroupName;

    @Column(name = "job_title", length = 100)
    private String jobTitle;

    @Column(name = "effective_start_date", nullable = false)
    private LocalDate effectiveStartDate;

    @Column(name = "effective_end_date")
    private LocalDate effectiveEndDate;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "created_by_id", length = 36)
    private String createdById;

    @Column(name = "source", length = 20, nullable = false)
    private String source = "AUTO";

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

    @Builder
    public OrgMemberHistory(Organization organization, OrganizationMember member,
                            String departmentId, String departmentName,
                            String positionId, String positionName,
                            String titleId, String titleName,
                            String gradeId, String gradeName,
                            String jobGroupId, String jobGroupName,
                            String jobTitle,
                            LocalDate effectiveStartDate, LocalDate effectiveEndDate,
                            String description, String createdById, String source) {
        this.organization = organization;
        this.member = member;
        this.departmentId = departmentId;
        this.departmentName = departmentName;
        this.positionId = positionId;
        this.positionName = positionName;
        this.titleId = titleId;
        this.titleName = titleName;
        this.gradeId = gradeId;
        this.gradeName = gradeName;
        this.jobGroupId = jobGroupId;
        this.jobGroupName = jobGroupName;
        this.jobTitle = jobTitle;
        this.effectiveStartDate = effectiveStartDate;
        this.effectiveEndDate = effectiveEndDate;
        this.description = description;
        this.createdById = createdById;
        this.source = source != null ? source : "AUTO";
    }

    public boolean isOpen() {
        return this.effectiveEndDate == null;
    }

    public void close(LocalDate endDate) {
        this.effectiveEndDate = endDate;
    }

    public void updateDescription(String description) {
        this.description = description;
    }
}
