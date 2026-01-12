package com.kanban.domain.weight;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.task.Task;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "task_weights")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class TaskWeight extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "task_id", nullable = false)
    private Task task;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "weight_level_id", nullable = false)
    private WeightLevel weightLevel;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateWeightLevel(WeightLevel weightLevel) {
        this.weightLevel = weightLevel;
    }

    public static TaskWeight create(Task task, WeightLevel weightLevel) {
        return TaskWeight.builder()
                .task(task)
                .weightLevel(weightLevel)
                .build();
    }
}
