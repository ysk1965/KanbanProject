package com.kanban.domain.checklist;

import com.kanban.domain.contractor.entity.BoardContractor;
import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;
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
    @Index(name = "idx_checklist_task_position", columnList = "task_id, position")
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

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "done_date")
    private LocalDate doneDate;

    /**
     * 임시(예정) 업무 플래그.
     * true이면 세부 체크리스트가 확정되기 전 워크로드에 미리 잡아둔 "예정" 항목으로,
     * 워크로드/캘린더(by-assignee) 조회에만 노출되고 태스크 카운트·진행률·통계·리포트에는 집계되지 않는다.
     */
    @Column(name = "is_tentative", nullable = false)
    @ColumnDefault("false")
    @Builder.Default
    private Boolean isTentative = false;

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
            this.isCompleted = false;
            this.completedAt = null;
            this.doneDate = null;
        } else {
            this.isCompleted = true;
            this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
            this.doneDate = LocalDate.now();
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
    }

    public void uncomplete() {
        if (this.isCompleted) {
            this.isCompleted = false;
            this.completedAt = null;
            this.doneDate = null;
        }
    }

    public void setIsTentative(Boolean isTentative) {
        this.isTentative = (isTentative != null && isTentative);
    }

    /** 임시(예정) 항목을 실제 체크리스트 항목으로 전환한다. */
    public void promote() {
        this.isTentative = false;
    }
}
