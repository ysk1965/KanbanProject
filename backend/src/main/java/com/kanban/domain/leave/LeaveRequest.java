package com.kanban.domain.leave;

import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.OrganizationMember;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "leave_requests")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class LeaveRequest {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requester_id")
    private OrganizationMember requester;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "policy_id", nullable = false)
    private LeavePolicy policy;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "duration_type", nullable = false, length = 20)
    @Builder.Default
    private LeaveDurationType durationType = LeaveDurationType.FULL_DAY;

    @Column(name = "total_days", nullable = false, precision = 4, scale = 1)
    private BigDecimal totalDays;

    @Column(columnDefinition = "TEXT")
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private LeaveStatus status = LeaveStatus.PENDING;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewer_id")
    private OrganizationMember reviewer;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;

    @Column(name = "review_comment", columnDefinition = "TEXT")
    private String reviewComment;

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

    public void approve(OrganizationMember reviewer) {
        this.status = LeaveStatus.APPROVED;
        this.reviewer = reviewer;
        this.reviewedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void reject(OrganizationMember reviewer, String comment) {
        this.status = LeaveStatus.REJECTED;
        this.reviewer = reviewer;
        this.reviewedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.reviewComment = comment;
    }

    public void cancel() {
        this.status = LeaveStatus.CANCELED;
    }

    public boolean canCancelAfterApproval() {
        return !this.endDate.isBefore(LocalDate.now());
    }

    public boolean isPending() {
        return this.status == LeaveStatus.PENDING;
    }

    public boolean isApproved() {
        return this.status == LeaveStatus.APPROVED;
    }
}
