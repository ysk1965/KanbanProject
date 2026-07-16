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

    /**
     * 보드 생성 시 시스템이 자동으로 만든 "기본 마일스톤" 여부.
     * 사용자가 한 번도 손대지 않은 기본 마일스톤은 기간이 지나도 overdue(빨강) 경고를 띄우지 않는다.
     * updateInfo로 제목/기간을 편집하는 순간 false로 전환된다.
     */
    @Column(name = "is_default", nullable = false)
    @Builder.Default
    private Boolean isDefault = false;

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
        if (this.isDefault == null) {
            this.isDefault = false;
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
        // 사용자가 직접 편집한 순간부터는 기본 마일스톤이 아니다 → overdue 경고 정상 노출
        this.isDefault = false;
    }

    /** 보드 생성 시 시스템이 만드는 기본 마일스톤 팩토리. */
    public static Milestone createDefault(Board board, String title, LocalDate startDate, LocalDate endDate, User createdBy) {
        return Milestone.builder()
                .board(board)
                .title(title)
                .startDate(startDate)
                .endDate(endDate)
                .createdBy(createdBy)
                .isDefault(true)
                .build();
    }

    public void updateDefaultHoursPerDay(Double defaultHoursPerDay) {
        if (defaultHoursPerDay != null) {
            this.defaultHoursPerDay = defaultHoursPerDay;
        }
    }
}
