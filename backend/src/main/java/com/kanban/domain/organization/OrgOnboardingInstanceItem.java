package com.kanban.domain.organization;

import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "org_onboarding_instance_items")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrgOnboardingInstanceItem {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "instance_id", nullable = false)
    private OrgOnboardingInstance instance;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 500)
    private String description;

    private LocalDate dueDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_id")
    private OrganizationMember assignee;

    @Column(name = "is_completed", nullable = false)
    @Builder.Default
    private boolean completed = false;

    private LocalDateTime completedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "completed_by")
    private User completedBy;

    @Column(nullable = false)
    @Builder.Default
    private int displayOrder = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
        if (this.createdAt == null) this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void toggleComplete(User user) {
        this.completed = !this.completed;
        if (this.completed) {
            this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
            this.completedBy = user;
        } else {
            this.completedAt = null;
            this.completedBy = null;
        }
    }
}
