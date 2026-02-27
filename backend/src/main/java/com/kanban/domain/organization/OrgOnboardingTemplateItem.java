package com.kanban.domain.organization;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "org_onboarding_template_items")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrgOnboardingTemplateItem {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "template_id", nullable = false)
    private OrgOnboardingTemplate template;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 500)
    private String description;

    private Integer dueDayOffset;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private AssigneeRole assigneeRole;

    @Column(nullable = false)
    @Builder.Default
    private int displayOrder = 0;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
    }
}
