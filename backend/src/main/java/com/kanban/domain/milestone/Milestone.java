package com.kanban.domain.milestone;

import com.kanban.domain.board.Board;
import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "milestones")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Milestone extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "title", nullable = false, length = 100)
    private String title;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @Column(name = "default_hours_per_day")
    @Builder.Default
    private Double defaultHoursPerDay = 6.0;

    /** A안: 스프린트 레이어 노출 토글. false면 마일스톤 단일 진행률로만 관리. */
    @Column(name = "sprint_enabled", nullable = false)
    @Builder.Default
    private Boolean sprintEnabled = false;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.defaultHoursPerDay == null) {
            this.defaultHoursPerDay = 6.0;
        }
        if (this.sprintEnabled == null) {
            this.sprintEnabled = false;
        }
    }

    public void updateSprintEnabled(boolean enabled) {
        this.sprintEnabled = enabled;
    }

    public void updateInfo(String title, String description, LocalDate startDate, LocalDate endDate) {
        if (title != null) {
            this.title = title;
        }
        if (description != null) {
            this.description = description;
        }
        if (startDate != null) {
            this.startDate = startDate;
        }
        if (endDate != null) {
            this.endDate = endDate;
        }
    }

    public void updateDefaultHoursPerDay(Double defaultHoursPerDay) {
        if (defaultHoursPerDay != null) {
            this.defaultHoursPerDay = defaultHoursPerDay;
        }
    }
}
