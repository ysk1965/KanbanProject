package com.kanban.domain.okr;

import com.kanban.domain.board.Board;
import com.kanban.domain.organization.OrganizationMember;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "okr_key_results")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class OkrKeyResult {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "objective_id", nullable = false)
    private OkrObjective objective;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "metric_type", nullable = false, length = 20)
    @Builder.Default
    private String metricType = "PERCENTAGE";

    @Column(name = "start_value", nullable = false)
    @Builder.Default
    private Double startValue = 0.0;

    @Column(name = "target_value", nullable = false)
    @Builder.Default
    private Double targetValue = 100.0;

    @Column(name = "current_value", nullable = false)
    @Builder.Default
    private Double currentValue = 0.0;

    @Column(length = 20)
    private String unit;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private OrganizationMember owner;

    @Column(nullable = false)
    @Builder.Default
    private Double weight = 1.0;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "linked_board_id")
    private Board linkedBoard;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateInfo(String title, String description, String metricType,
                           Double startValue, Double targetValue, String unit,
                           OrganizationMember owner, Double weight, Board linkedBoard) {
        if (title != null) {
            this.title = title;
        }
        if (description != null) {
            this.description = description;
        }
        if (metricType != null) {
            this.metricType = metricType;
        }
        if (startValue != null) {
            this.startValue = startValue;
        }
        if (targetValue != null) {
            this.targetValue = targetValue;
        }
        if (unit != null) {
            this.unit = unit;
        }
        this.owner = owner;
        if (weight != null) {
            this.weight = weight;
        }
        this.linkedBoard = linkedBoard;
    }

    public void updateCurrentValue(Double value) {
        if (value != null) {
            this.currentValue = value;
        }
    }
}
