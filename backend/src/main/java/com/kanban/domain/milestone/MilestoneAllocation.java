package com.kanban.domain.milestone;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "milestone_allocations", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"milestone_id", "member_id"})
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MilestoneAllocation extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "milestone_id", nullable = false)
    private Milestone milestone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private User member;

    @Column(name = "working_days", nullable = false)
    private Integer workingDays;

    @Column(name = "total_allocated_hours", nullable = false)
    private Double totalAllocatedHours;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateAllocation(Integer workingDays, Double totalAllocatedHours) {
        if (workingDays != null) {
            this.workingDays = workingDays;
        }
        if (totalAllocatedHours != null) {
            this.totalAllocatedHours = totalAllocatedHours;
        }
    }

    public static MilestoneAllocation create(Milestone milestone, User member, Integer workingDays, Double totalAllocatedHours) {
        return MilestoneAllocation.builder()
                .milestone(milestone)
                .member(member)
                .workingDays(workingDays)
                .totalAllocatedHours(totalAllocatedHours)
                .build();
    }
}
