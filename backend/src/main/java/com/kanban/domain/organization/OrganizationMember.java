package com.kanban.domain.organization;

import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "organization_members",
       uniqueConstraints = @UniqueConstraint(columnNames = {"organization_id", "user_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class OrganizationMember {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrgRole role;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private OrganizationDepartment department;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_group_id")
    private OrganizationJobGroup jobGroup;

    @Column(name = "job_title", length = 100)
    private String jobTitle;

    @Enumerated(EnumType.STRING)
    @Column(name = "contract_type", length = 20)
    @Builder.Default
    private ContractType contractType = ContractType.FULL_TIME;

    @Enumerated(EnumType.STRING)
    @Column(name = "work_status", length = 20)
    @Builder.Default
    private WorkStatus workStatus = WorkStatus.ACTIVE;

    @Column(name = "employee_id", length = 50)
    private String employeeId;

    @Column(length = 30)
    private String phone;

    @Column(name = "birth_date")
    private LocalDate birthDate;

    @Column(name = "hire_date")
    private LocalDate hireDate;

    @Column(columnDefinition = "TEXT")
    private String bio;

    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invited_by")
    private User invitedBy;

    @Column(name = "display_order")
    @Builder.Default
    private Integer displayOrder = 0;

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
        if (this.joinedAt == null) {
            this.joinedAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public boolean isOwner() {
        return this.role == OrgRole.OWNER;
    }

    public boolean isAdmin() {
        return this.role == OrgRole.ADMIN;
    }

    public boolean isAdminOrAbove() {
        return this.role == OrgRole.OWNER || this.role == OrgRole.ADMIN;
    }

    public boolean isActive() {
        return this.workStatus == WorkStatus.ACTIVE || this.workStatus == WorkStatus.ON_LEAVE;
    }

    public void updateRole(OrgRole role) {
        this.role = role;
    }

    public void updateDepartment(OrganizationDepartment department) {
        this.department = department;
    }

    public void updateJobGroup(OrganizationJobGroup jobGroup) {
        this.jobGroup = jobGroup;
    }

    public void updateInfo(String jobTitle, ContractType contractType, WorkStatus workStatus,
                           String employeeId, String phone, LocalDate birthDate, LocalDate hireDate, String bio) {
        if (jobTitle != null) this.jobTitle = jobTitle;
        if (contractType != null) this.contractType = contractType;
        if (workStatus != null) this.workStatus = workStatus;
        if (employeeId != null) this.employeeId = employeeId;
        if (phone != null) this.phone = phone;
        this.birthDate = birthDate;
        this.hireDate = hireDate;
        if (bio != null) this.bio = bio;
    }
}
