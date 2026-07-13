package com.kanban.domain.checklist;

import com.kanban.domain.contractor.entity.BoardContractor;
import com.kanban.domain.sprint.Sprint;
import com.kanban.domain.sprint.SprintStage;
import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@SQLRestriction("deleted_at IS NULL")
@Table(name = "checklist_items", indexes = {
    @Index(name = "idx_checklist_task_id", columnList = "task_id"),
    @Index(name = "idx_checklist_assignee_id", columnList = "assignee_id"),
    @Index(name = "idx_checklist_task_position", columnList = "task_id, position"),
    @Index(name = "idx_checklist_sprint", columnList = "sprint_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ChecklistItem {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "task_id", nullable = false)
    private Task task;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "is_completed", nullable = false)
    @Builder.Default
    private Boolean isCompleted = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_id")
    private User assignee;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contractor_id")
    private BoardContractor contractor;

    // ==================== Sprint (담긴 스프린트 + 프레임 내 위치) ====================
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sprint_id")
    private Sprint sprint;

    @Enumerated(EnumType.STRING)
    @Column(name = "sprint_stage", length = 20)
    private SprintStage sprintStage;

    /** B안: 완료 체크한 유저 (담당자가 아니어도 됨). 완료자 ≠ 담당자면 "대신 완료". */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "completed_by")
    private User completedBy;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "done_date")
    private LocalDate doneDate;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Column(name = "deleted_by", length = 36)
    private String deletedBy;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public void softDelete(String userId, LocalDateTime when) {
        this.deletedAt = when;
        this.deletedBy = userId;
    }

    public void restore() {
        this.deletedAt = null;
        this.deletedBy = null;
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }

    public void updateInfo(String title, LocalDate startDate, LocalDate dueDate) {
        if (title != null) this.title = title;
        this.startDate = startDate;
        this.dueDate = dueDate;
    }

    public void updateTitle(String title) {
        this.title = title;
    }

    public void updateStartDate(LocalDate startDate) {
        this.startDate = startDate;
    }

    public void updateDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }

    public void updateAssignee(User assignee) {
        this.assignee = assignee;
        if (assignee != null) {
            this.contractor = null;
        }
    }

    public void updateContractor(BoardContractor contractor) {
        this.contractor = contractor;
        if (contractor != null) {
            this.assignee = null;
        }
    }

    public void updatePosition(Integer position) {
        this.position = position;
    }

    public void toggle() {
        if (this.isCompleted) {
            uncomplete();
        } else {
            complete();
        }
    }

    public void moveToTask(Task newTask, int newPosition) {
        this.task = newTask;
        this.position = newPosition;
    }

    public void complete() {
        if (!this.isCompleted) {
            this.isCompleted = true;
            this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
            this.doneDate = LocalDate.now();
        }
        // 스프린트에 담긴 항목이면 프레임 위치도 Done으로 동기화 (양방향)
        if (this.sprint != null) {
            this.sprintStage = SprintStage.DONE;
        }
    }

    public void uncomplete() {
        if (this.isCompleted) {
            this.isCompleted = false;
            this.completedAt = null;
            this.doneDate = null;
        }
        this.completedBy = null;
        // Done 상태였던 스프린트 카드는 In Review로 되돌린다
        if (this.sprint != null && this.sprintStage == SprintStage.DONE) {
            this.sprintStage = SprintStage.REVIEW;
        }
    }

    /** B안: 완료 체크한 유저 기록 (완료 상태일 때만 유효) */
    public void recordCompleter(User user) {
        this.completedBy = user;
    }

    // ==================== Sprint helpers ====================

    /** 백로그 항목을 스프린트에 담는다 (Sprint 컬럼으로). 완료 상태면 바로 Done. */
    public void assignToSprint(Sprint sprint) {
        this.sprint = sprint;
        this.sprintStage = Boolean.TRUE.equals(this.isCompleted) ? SprintStage.DONE : SprintStage.SPRINT;
    }

    /** 프레임 내 카드 이동 (sprint ↔ review ↔ done). Done 이동 시 완료 동기화. */
    public void moveSprintStage(SprintStage stage) {
        this.sprintStage = stage;
        if (stage == SprintStage.DONE) {
            complete();
        } else if (Boolean.TRUE.equals(this.isCompleted)) {
            uncomplete();
        }
    }

    /** 스프린트에서 빼서 Task 백로그로 되돌린다 (완료 여부는 유지). */
    public void removeFromSprint() {
        this.sprint = null;
        this.sprintStage = null;
    }

    public boolean isInSprint() {
        return this.sprint != null;
    }
}
