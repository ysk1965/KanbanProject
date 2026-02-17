package com.kanban.domain.personal;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "personal_events", indexes = {
        @Index(name = "idx_personal_event_user_date", columnList = "user_id, event_date")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PersonalEvent extends BaseTimeEntity {

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

    @Column(name = "event_date", nullable = false)
    private LocalDate eventDate;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @Column(name = "color", length = 20)
    @Builder.Default
    private String color = "#6366F1";

    @Column(name = "all_day")
    @Builder.Default
    private Boolean allDay = false;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void update(String title, String description, LocalDate eventDate,
                       LocalTime startTime, LocalTime endTime, String color, Boolean allDay) {
        if (title != null) this.title = title;
        if (description != null) this.description = description;
        if (eventDate != null) this.eventDate = eventDate;
        this.startTime = startTime;
        this.endTime = endTime;
        if (color != null) this.color = color;
        if (allDay != null) this.allDay = allDay;
    }
}
