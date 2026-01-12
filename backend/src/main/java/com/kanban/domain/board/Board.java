package com.kanban.domain.board;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "boards")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Board extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(name = "work_hours_per_day")
    @Builder.Default
    private Integer workHoursPerDay = 8;

    @Column(name = "work_start_time")
    @Builder.Default
    private LocalTime workStartTime = LocalTime.of(9, 0);

    @Column(name = "schedule_display_mode", length = 10)
    @Builder.Default
    private String scheduleDisplayMode = "TIME";

    @Column(name = "selected_milestone_id", length = 36)
    private String selectedMilestoneId;

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

    public boolean isOwner(String userId) {
        return this.owner.getId().equals(userId);
    }

    public void updateScheduleSettings(Integer workHoursPerDay, LocalTime workStartTime, String scheduleDisplayMode) {
        if (workHoursPerDay != null) {
            this.workHoursPerDay = workHoursPerDay;
        }
        if (workStartTime != null) {
            this.workStartTime = workStartTime;
        }
        if (scheduleDisplayMode != null) {
            this.scheduleDisplayMode = scheduleDisplayMode;
        }
    }

    public void updateSelectedMilestone(String milestoneId) {
        this.selectedMilestoneId = milestoneId;
    }
}
