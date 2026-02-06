package com.kanban.domain.announcement;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "announcements")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Announcement extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "content", columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", length = 20)
    @Builder.Default
    private AnnouncementType type = AnnouncementType.NOTICE;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "start_at")
    private LocalDateTime startAt;

    @Column(name = "end_at")
    private LocalDateTime endAt;

    @Column(name = "priority")
    @Builder.Default
    private Integer priority = 0;

    @Column(name = "target_role", length = 20)
    private String targetRole;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void update(String title, String content, AnnouncementType type,
                       Boolean isActive, LocalDateTime startAt, LocalDateTime endAt,
                       Integer priority, String targetRole) {
        this.title = title;
        this.content = content;
        this.type = type;
        this.isActive = isActive;
        this.startAt = startAt;
        this.endAt = endAt;
        this.priority = priority;
        this.targetRole = targetRole;
    }

    public void deactivate() {
        this.isActive = false;
    }
}
