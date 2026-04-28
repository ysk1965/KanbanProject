package com.kanban.domain.feature;

import com.kanban.domain.board.Board;
import com.kanban.domain.common.BaseTimeEntity;
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
@Table(name = "features", indexes = {
    @Index(name = "idx_feature_board_id", columnList = "board_id"),
    @Index(name = "idx_feature_status", columnList = "status"),
    @Index(name = "idx_feature_board_position", columnList = "board_id, position")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Feature extends BaseTimeEntity {

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

    @Column(name = "color", length = 20)
    private String color;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_id")
    private User assignee;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private FeatureStatus status = FeatureStatus.ACTIVE;

    @Column(name = "total_tasks", nullable = false)
    @Builder.Default
    private Integer totalTasks = 0;

    @Column(name = "completed_tasks", nullable = false)
    @Builder.Default
    private Integer completedTasks = 0;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

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

    public void recalcCounters(int total, int completed) {
        this.totalTasks = total;
        this.completedTasks = completed;
        if (this.totalTasks > 0 && this.completedTasks.equals(this.totalTasks)) {
            this.status = FeatureStatus.COMPLETED;
            if (this.completedAt == null) {
                this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
            }
        } else {
            this.status = FeatureStatus.ACTIVE;
            this.completedAt = null;
        }
    }

    public void updateInfo(String title, String description, String color, LocalDate startDate, LocalDate dueDate) {
        if (title != null) this.title = title;
        if (description != null) this.description = description;
        if (color != null) this.color = color;
        this.startDate = startDate;
        this.dueDate = dueDate;
    }

    public void updateAssignee(User assignee) {
        this.assignee = assignee;
    }

    public void updatePosition(Integer position) {
        this.position = position;
    }

    public void incrementTotalTasks() {
        this.totalTasks++;
    }

    public void decrementTotalTasks() {
        if (this.totalTasks > 0) {
            this.totalTasks--;
        }
    }

    public void incrementCompletedTasks() {
        this.completedTasks++;
        checkCompletion();
    }

    public void decrementCompletedTasks() {
        if (this.completedTasks > 0) {
            this.completedTasks--;
        }
        if (this.status == FeatureStatus.COMPLETED) {
            this.status = FeatureStatus.ACTIVE;
            this.completedAt = null;
        }
    }

    private void checkCompletion() {
        if (this.totalTasks > 0 && this.completedTasks.equals(this.totalTasks)) {
            this.status = FeatureStatus.COMPLETED;
            this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public int getProgressPercentage() {
        if (this.totalTasks == 0) return 0;
        return (int) ((this.completedTasks * 100.0) / this.totalTasks);
    }
}
