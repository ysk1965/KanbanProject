package com.kanban.domain.personal;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "personal_habit_logs", uniqueConstraints = {
        @UniqueConstraint(name = "uk_habit_log_date", columnNames = {"habit_id", "log_date"})
}, indexes = {
        @Index(name = "idx_habit_log_date", columnList = "habit_id, log_date"),
        @Index(name = "idx_habit_log_completed", columnList = "habit_id, is_completed, log_date")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PersonalHabitLog {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "habit_id", nullable = false)
    private PersonalHabit habit;

    @Column(name = "log_date", nullable = false)
    private LocalDate logDate;

    @Column(name = "completed_count", nullable = false)
    @Builder.Default
    private Integer completedCount = 0;

    @Column(name = "is_completed", nullable = false)
    @Builder.Default
    private Boolean isCompleted = false;

    @Column(name = "note", length = 200)
    private String note;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public void incrementCount(int targetCount) {
        this.completedCount++;
        this.isCompleted = this.completedCount >= targetCount;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void toggleComplete(int targetCount) {
        if (this.isCompleted) {
            this.completedCount = 0;
            this.isCompleted = false;
        } else {
            this.completedCount = targetCount;
            this.isCompleted = true;
        }
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}
