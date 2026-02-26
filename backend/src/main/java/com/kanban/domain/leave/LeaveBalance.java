package com.kanban.domain.leave;

import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.OrganizationMember;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "leave_balances",
       uniqueConstraints = @UniqueConstraint(columnNames = {"member_id", "policy_id", "year"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class LeaveBalance {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private OrganizationMember member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "policy_id", nullable = false)
    private LeavePolicy policy;

    @Column(name = "leave_year", nullable = false)
    private Integer year;

    @Column(name = "total_days", nullable = false, precision = 4, scale = 1)
    @Builder.Default
    private BigDecimal totalDays = BigDecimal.ZERO;

    @Column(name = "used_days", nullable = false, precision = 4, scale = 1)
    @Builder.Default
    private BigDecimal usedDays = BigDecimal.ZERO;

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

    public BigDecimal getRemaining() {
        return totalDays.subtract(usedDays);
    }

    public boolean hasEnough(BigDecimal days) {
        return getRemaining().compareTo(days) >= 0;
    }

    public void consumeDays(BigDecimal days) {
        this.usedDays = this.usedDays.add(days);
    }

    public void restoreDays(BigDecimal days) {
        this.usedDays = this.usedDays.subtract(days);
        if (this.usedDays.compareTo(BigDecimal.ZERO) < 0) {
            this.usedDays = BigDecimal.ZERO;
        }
    }

    public void updateTotalDays(BigDecimal totalDays) {
        this.totalDays = totalDays;
    }
}
