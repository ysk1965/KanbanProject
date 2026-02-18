package com.kanban.domain.personal;

import com.kanban.domain.user.User;
import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "personal_habits", indexes = {
        @Index(name = "idx_personal_habit_user_active", columnList = "user_id, is_active"),
        @Index(name = "idx_personal_habit_user_position", columnList = "user_id, is_active, position")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PersonalHabit extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "icon", length = 50)
    private String icon;

    @Column(name = "color", length = 20)
    @Builder.Default
    private String color = "#8B5CF6";

    @Enumerated(EnumType.STRING)
    @Column(name = "frequency_type", nullable = false, length = 20)
    @Builder.Default
    private HabitFrequency frequencyType = HabitFrequency.DAILY;

    @Column(name = "frequency_days", length = 20)
    private String frequencyDays;

    @Column(name = "target_count", nullable = false)
    @Builder.Default
    private Integer targetCount = 1;

    @Column(name = "unit", length = 50)
    private String unit;

    @Column(name = "current_streak", nullable = false)
    @Builder.Default
    private Integer currentStreak = 0;

    @Column(name = "best_streak", nullable = false)
    @Builder.Default
    private Integer bestStreak = 0;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;

    @OneToMany(mappedBy = "habit", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<PersonalHabitLog> logs = new ArrayList<>();

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void update(String title, String description, String icon, String color,
                       HabitFrequency frequencyType, String frequencyDays,
                       Integer targetCount, String unit) {
        if (title != null) this.title = title;
        if (description != null) this.description = description;
        this.icon = icon;
        if (color != null) this.color = color;
        if (frequencyType != null) this.frequencyType = frequencyType;
        this.frequencyDays = frequencyDays;
        if (targetCount != null) this.targetCount = targetCount;
        this.unit = unit;
    }

    public void updatePosition(int position) {
        this.position = position;
    }

    public void deactivate() {
        this.isActive = false;
    }

    public void updateStreak(int currentStreak) {
        this.currentStreak = currentStreak;
        if (currentStreak > this.bestStreak) {
            this.bestStreak = currentStreak;
        }
    }
}
