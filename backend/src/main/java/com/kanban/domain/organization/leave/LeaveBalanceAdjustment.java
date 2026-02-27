package com.kanban.domain.organization.leave;

import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.OrganizationMember;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "leave_balance_adjustments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class LeaveBalanceAdjustment {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "balance_id", nullable = false)
    private LeaveBalance balance;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id")
    private OrganizationMember member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "policy_id", nullable = false)
    private LeavePolicy policy;

    @Enumerated(EnumType.STRING)
    @Column(name = "adjustment_type", nullable = false, length = 20)
    private LeaveAdjustmentType adjustmentType;

    @Column(name = "days", nullable = false, precision = 4, scale = 1)
    private BigDecimal days;

    @Column(name = "previous_total", nullable = false, precision = 4, scale = 1)
    private BigDecimal previousTotal;

    @Column(name = "new_total", nullable = false, precision = 4, scale = 1)
    private BigDecimal newTotal;

    @Column(name = "reason", nullable = false, columnDefinition = "TEXT")
    private String reason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "granted_by")
    private OrganizationMember grantedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }
}
