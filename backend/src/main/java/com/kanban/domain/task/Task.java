package com.kanban.domain.task;

import com.kanban.domain.block.Block;
import com.kanban.domain.board.Board;
import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.milestone.Milestone;
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

    /**
     * 이 태스크가 배정된 마일스톤. nullable — 피처가 어떤 마일스톤에도 속하지 않으면 null.
     * 불변식: 값이 있으면 항상 이 태스크의 피처가 연결된 마일스톤 중 하나여야 한다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "milestone_id")
    private Milestone milestone;

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

    /**
     * 피처(서브태스크 리스트) 내 표시 순서. position은 칸반 블록 내 순서라 별도 관리한다.
     */
    @Column(name = "feature_position", nullable = false)
    @Builder.Default
    private Integer featurePosition = 0;

    /** 보드 내 태스크 순번 (사람이 읽는 키의 숫자부). 예: 42 */
    @Column(name = "task_number")
    private Integer taskNumber;

    /**
     * 사람이 읽는 불변 키. 예: "STORY-42". 생성 시 발급되며 보드 이동/삭제에도 바뀌지 않는다.
     * 전역 유니크(uk_tasks_task_key). 링크 해석은 이 값의 단일 인덱스 조회로 처리한다.
     */
    @Column(name = "task_key", length = 20)
    private String taskKey;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

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

    public void updateFeaturePosition(Integer featurePosition) {
        this.featurePosition = featurePosition;
    }

    /** 사람이 읽는 키 배정 (생성 또는 백필 시 1회). */
    public void assignKey(Integer taskNumber, String taskKey) {
        this.taskNumber = taskNumber;
        this.taskKey = taskKey;
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

        // 기존 마일스톤은 새 피처에 유효하지 않을 수 있으므로 해제.
        // 서비스에서 새 피처의 대표 마일스톤으로 재설정한다 (불변식 유지).
        this.milestone = null;
    }

    /** 태스크를 마일스톤에 배정 (null 허용 — 마일스톤 미지정) */
    public void assignMilestone(Milestone milestone) {
        this.milestone = milestone;
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
