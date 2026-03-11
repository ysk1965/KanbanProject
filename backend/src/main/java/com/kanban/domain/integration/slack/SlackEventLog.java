package com.kanban.domain.integration.slack;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "slack_event_logs", indexes = {
    @Index(name = "idx_slack_event_log_event_id", columnList = "event_id", unique = true)
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SlackEventLog {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "event_id", nullable = false, unique = true, length = 50)
    private String eventId;

    @Column(name = "event_type", length = 50)
    private String eventType;

    @Column(name = "processed_at", nullable = false)
    private LocalDateTime processedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
        if (this.processedAt == null) this.processedAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}
