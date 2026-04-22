package com.kanban.domain.planning;

import com.kanban.domain.board.Board;
import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "planning_cards")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@AllArgsConstructor
public class PlanningCard extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /**
     * 배치된 담당자. NULL = 풀(Pool) 상태
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_id")
    private User assignee;

    /**
     * ISO 8601 기준 월요일 시작 주차 날짜. NULL = 풀(Pool) 상태
     */
    @Column(name = "week_start_date")
    private LocalDate weekStartDate;

    /**
     * 주 시작일(weekStartDate)이 속한 마일스톤. 서버가 자동 계산/저장.
     * 갭 주 or 풀 상태일 때 NULL.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "primary_milestone_id")
    private Milestone primaryMilestone;

    @Column(name = "estimated_hours")
    private Double estimatedHours;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @Column(name = "color", length = 16)
    private String color;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    /**
     * Phase 2 슬롯 — 임시업무 카드가 Task로 승격될 때 연결되는 Task
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "promoted_task_id")
    private Task promotedTask;

    @Column(name = "promoted_at")
    private LocalDateTime promotedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.position == null) {
            this.position = 0;
        }
    }

    /**
     * 카드를 특정 셀(담당자 × 주차)로 이동하거나 풀로 복귀시킨다.
     * <p>
     * assignee, weekStartMonday, primaryMilestone 이 모두 null이면 풀 상태가 된다.
     *
     * @param assignee          이동 대상 담당자 (null = 풀)
     * @param weekStartMonday   ISO 월요일 날짜 (null = 풀)
     * @param primaryMilestone  주 시작일 기준 마일스톤 (서버 계산, null 허용)
     * @param position          셀 내 또는 풀 내 순서 (null 이면 현재 position 유지)
     */
    public void moveTo(User assignee, LocalDate weekStartMonday, Milestone primaryMilestone, Integer position) {
        this.assignee = assignee;
        this.weekStartDate = weekStartMonday;
        this.primaryMilestone = primaryMilestone;
        if (position != null) {
            this.position = position;
        }
    }

    /**
     * 마일스톤 기간 변경/삭제 시 서버 재계산 결과로 primaryMilestone을 갱신한다.
     * PlanningCardRecomputeService에서만 호출.
     *
     * @param newPrimary 재계산된 마일스톤 (갭 주 or 풀 상태이면 null)
     */
    public void reindexPrimaryMilestone(Milestone newPrimary) {
        this.primaryMilestone = newPrimary;
    }

    /**
     * 카드의 내용(제목, 설명, 예상시간, 색상)을 업데이트한다.
     */
    public void updateContent(String title, String description, Double estimatedHours, String color) {
        if (title != null) {
            this.title = title;
        }
        if (description != null) {
            this.description = description;
        }
        if (estimatedHours != null) {
            this.estimatedHours = estimatedHours;
        }
        if (color != null) {
            this.color = color;
        }
    }
}
