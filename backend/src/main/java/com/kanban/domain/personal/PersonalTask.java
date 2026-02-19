package com.kanban.domain.personal;

import com.kanban.domain.user.User;
import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "personal_tasks", indexes = {
        @Index(name = "idx_personal_task_user_status", columnList = "user_id, status"),
        @Index(name = "idx_personal_task_user_position", columnList = "user_id, status, position")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PersonalTask extends BaseTimeEntity {

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

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private PersonalTaskStatus status = PersonalTaskStatus.TODO;

    @Enumerated(EnumType.STRING)
    @Column(name = "priority", nullable = false, length = 10)
    @Builder.Default
    private PersonalTaskPriority priority = PersonalTaskPriority.MEDIUM;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "category", length = 100)
    private String category;

    @Column(name = "color", length = 20)
    private String color;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @OneToMany(mappedBy = "personalTask", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<PersonalTaskChecklist> checklists = new ArrayList<>();

    @OneToMany(mappedBy = "personalTask", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private Set<PersonalTaskTag> taskTags = new HashSet<>();

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void update(String title, String description, PersonalTaskPriority priority,
                       LocalDate dueDate, String category, String color) {
        if (title != null) this.title = title;
        if (description != null) this.description = description;
        if (priority != null) this.priority = priority;
        if (dueDate != null) this.dueDate = dueDate;
        if (category != null) this.category = category;
        if (color != null) this.color = color;
    }

    public void updateStatus(PersonalTaskStatus newStatus) {
        this.status = newStatus;
        if (newStatus == PersonalTaskStatus.DONE) {
            this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
        } else {
            this.completedAt = null;
        }
    }

    public void updatePosition(int position) {
        this.position = position;
    }
}
