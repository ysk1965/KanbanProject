package com.kanban.domain.checklist;

import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "checklist_items")
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

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now();
        }
    }

    public void updateInfo(String title, LocalDate startDate, LocalDate dueDate) {
        if (title != null) this.title = title;
        this.startDate = startDate;
        this.dueDate = dueDate;
    }

    public void updateAssignee(User assignee) {
        this.assignee = assignee;
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
            this.completedAt = LocalDateTime.now();
            this.doneDate = LocalDate.now();
        }
    }

    public void complete() {
        if (!this.isCompleted) {
            this.isCompleted = true;
            this.completedAt = LocalDateTime.now();
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
}
