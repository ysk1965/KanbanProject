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
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "tasks", indexes = {
    @Index(name = "idx_task_board_id", columnList = "board_id"),
    @Index(name = "idx_task_feature_id", columnList = "feature_id"),
    @Index(name = "idx_task_block_id", columnList = "block_id"),
    @Index(name = "idx_task_board_completed", columnList = "board_id, is_completed"),
    @Index(name = "idx_task_board_position", columnList = "board_id, position")
})
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

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "baseline_start_date")
    private LocalDate baselineStartDate;

    @Column(name = "baseline_due_date")
    private LocalDate baselineDueDate;

    @Column(name = "estimated_minutes")
    private Integer estimatedMinutes;

    @Column(name = "is_completed", nullable = false)
    @Builder.Default
    private Boolean isCompleted = false;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateInfo(String title, String description, LocalDate startDate, LocalDate dueDate, Integer estimatedMinutes) {
        if (title != null) this.title = title;
        if (description != null) this.description = description;
        this.startDate = startDate;
        this.dueDate = dueDate;
        this.estimatedMinutes = estimatedMinutes;
    }

    public void updateDates(LocalDate startDate, LocalDate dueDate) {
        this.startDate = startDate;
        this.dueDate = dueDate;
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
            this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
            this.feature.incrementCompletedTasks();
        }
        // Done 블록에서 다른 블록으로 이동 시 완료 해제
        else if (!newBlock.isDoneBlock() && wasCompleted) {
            this.isCompleted = false;
            this.completedAt = null;
            this.feature.decrementCompletedTasks();
        }
    }

    public void moveToFeature(Feature newFeature) {
        Feature oldFeature = this.feature;

        // 이전 Feature에서 카운트 감소
        oldFeature.decrementTotalTasks();
        if (this.isCompleted) {
            oldFeature.decrementCompletedTasks();
        }

        // 새 Feature로 이동
        this.feature = newFeature;

        // 새 Feature에서 카운트 증가
        newFeature.incrementTotalTasks();
        if (this.isCompleted) {
            newFeature.incrementCompletedTasks();
        }
    }

    public void moveToBoard(Board newBoard, Block newBlock, Feature newFeature, int newPosition) {
        this.board = newBoard;
        this.block = newBlock;
        this.feature = newFeature;
        this.position = newPosition;
    }

    public void complete() {
        if (!this.isCompleted) {
            this.isCompleted = true;
            this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public void reopen() {
        if (this.isCompleted) {
            this.isCompleted = false;
            this.completedAt = null;
        }
    }

    public void saveBaseline() {
        this.baselineStartDate = this.startDate;
        this.baselineDueDate = this.dueDate;
    }

    public void clearBaseline() {
        this.baselineStartDate = null;
        this.baselineDueDate = null;
    }
}
