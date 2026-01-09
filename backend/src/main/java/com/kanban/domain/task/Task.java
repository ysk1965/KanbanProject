package com.kanban.domain.task;

import com.kanban.domain.block.Block;
import com.kanban.domain.board.Board;
import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "tasks")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Task extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "feature_id", nullable = false)
    private Feature feature;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "block_id", nullable = false)
    private Block block;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_id")
    private User assignee;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "estimated_minutes")
    private Integer estimatedMinutes;

    @Column(name = "is_completed", nullable = false)
    @Builder.Default
    private Boolean isCompleted = false;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateInfo(String title, String description, LocalDate dueDate, Integer estimatedMinutes) {
        if (title != null) this.title = title;
        if (description != null) this.description = description;
        this.dueDate = dueDate;
        this.estimatedMinutes = estimatedMinutes;
    }

    public void updateAssignee(User assignee) {
        this.assignee = assignee;
    }

    public void updatePosition(Integer position) {
        this.position = position;
    }

    public void moveToBlock(Block newBlock) {
        boolean wasCompleted = this.isCompleted;
        this.block = newBlock;

        // Done 블록으로 이동 시 완료 처리
        if (newBlock.isDoneBlock() && !wasCompleted) {
            this.isCompleted = true;
            this.completedAt = LocalDateTime.now();
            this.feature.incrementCompletedTasks();
        }
        // Done 블록에서 다른 블록으로 이동 시 완료 해제
        else if (!newBlock.isDoneBlock() && wasCompleted) {
            this.isCompleted = false;
            this.completedAt = null;
            this.feature.decrementCompletedTasks();
        }
    }

    public void complete() {
        if (!this.isCompleted) {
            this.isCompleted = true;
            this.completedAt = LocalDateTime.now();
        }
    }

    public void reopen() {
        if (this.isCompleted) {
            this.isCompleted = false;
            this.completedAt = null;
        }
    }
}
