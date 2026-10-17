package com.kanban.domain.checklist;

import com.kanban.domain.contractor.entity.BoardContractor;
import com.kanban.domain.sprint.Sprint;
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

    /** B안: 완료 체크한 유저 (담당자가 아니어도 됨). 완료자 ≠ 담당자면 "대신 완료". */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "completed_by")
    private User completedBy;

    /**
     * 줄 단위 스프린트 지정(오버라이드). null이면 부모 태스크의 스프린트를 따라간다.
     * 태스크 하나의 체크리스트 중 일부만 다른 스프린트에서 해야 할 때 태스크를 쪼개지 않고
     * 줄만 보내기 위한 값 — 실제 귀속은 {@link #effectiveSprint()}가 결정한다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sprint_id")
    private Sprint sprint;

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
        // 컬럼 동기화(END 컬럼으로 이동)는 서비스가 담당 — 엔티티는 형제 컬럼을 모른다.
    }

    public void uncomplete() {
        if (this.isCompleted) {
            this.isCompleted = false;
            this.completedAt = null;
            this.doneDate = null;
        }
        this.completedBy = null;
        // END 컬럼에서 벗어나는 이동은 서비스가 담당.
    }

    /** B안: 완료 체크한 유저 기록 (완료 상태일 때만 유효) */
    public void recordCompleter(User user) {
        this.completedBy = user;
    }

    /**
     * 이 줄이 실제로 속한 스프린트 — 지정값이 있으면 그것, 없으면 부모 태스크의 스프린트.
     * 스프린트 게이지·부분 카드·이월이 전부 이 판정 하나를 본다.
     */
    public Sprint effectiveSprint() {
        if (this.sprint != null) {
            return this.sprint;
        }
        return this.task != null ? this.task.getSprint() : null;
    }

    /** 지정값이 태스크의 스프린트와 같은가(=지정이 무의미한가). 정규화 판단용. */
    public boolean isSprintOverridden() {
        return this.sprint != null;
    }

    /**
     * 줄의 스프린트를 지정한다. 태스크의 스프린트와 같은 값이면 지정을 지워 상속으로 되돌린다 —
     * "태스크 따라가기"가 기본 상태이고, 지정은 예외일 때만 남아야 화면의 칩도 예외만 보여줄 수 있다.
     */
    public void assignSprint(Sprint target) {
        if (target == null) {
            this.sprint = null;
            return;
        }
        Sprint taskSprint = this.task != null ? this.task.getSprint() : null;
        if (taskSprint != null && taskSprint.getId().equals(target.getId())) {
            this.sprint = null;
        } else {
            this.sprint = target;
        }
    }

    /** 체크리스트가 스프린트 스코프 안에 있는가 (지정 또는 태스크 상속). */
    public boolean isInSprint() {
        return effectiveSprint() != null;
    }
}
