package com.kanban.domain.checklist;

import com.kanban.domain.contractor.entity.BoardContractor;
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
     * 스프린트 멤버십은 이 엔티티가 아니라 부모 {@link Task}가 들고 있다.
     * 체크리스트는 태스크에 딸린 내용물이므로, 태스크가 스프린트에 담겨 있으면 여기 추가되는
     * 항목도 별도 조작 없이 같은 스프린트 안에 함께 있게 된다.
     * (checklist_items.sprint_id 컬럼은 롤백 대비로 DB에만 남아 있고 매핑하지 않는다)
     */
    public boolean isInSprint() {
        return this.task != null && this.task.isInSprint();
    }
}
