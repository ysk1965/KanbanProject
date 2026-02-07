package com.kanban.domain.standup;

import com.kanban.domain.board.Board;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "daily_standup_configs",
    uniqueConstraints = @UniqueConstraint(name = "uk_standup_config_board", columnNames = {"board_id"}),
    indexes = {
        @Index(name = "idx_standup_config_enabled", columnList = "enabled, send_hour_utc, send_minute_utc")
    })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DailyStandupConfig {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false, unique = true)
    private Board board;

    @Column(name = "enabled", nullable = false)
    @Builder.Default
    private Boolean enabled = false;

    @Column(name = "send_hour_utc", nullable = false)
    @Builder.Default
    private Integer sendHourUtc = 0;

    @Column(name = "send_minute_utc", nullable = false)
    @Builder.Default
    private Integer sendMinuteUtc = 0;

    @Column(name = "timezone", nullable = false, length = 50)
    @Builder.Default
    private String timezone = "UTC";

    @Column(name = "language", nullable = false, length = 5)
    @Builder.Default
    private String language = "ko";

    @Column(name = "last_sent_at")
    private LocalDateTime lastSentAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (this.createdAt == null) this.createdAt = now;
        if (this.updatedAt == null) this.updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void update(Boolean enabled, Integer sendHourUtc, Integer sendMinuteUtc,
                       String timezone, String language) {
        if (enabled != null) this.enabled = enabled;
        if (sendHourUtc != null) this.sendHourUtc = sendHourUtc;
        if (sendMinuteUtc != null) this.sendMinuteUtc = sendMinuteUtc;
        if (timezone != null) this.timezone = timezone;
        if (language != null) this.language = language;
    }

    public void markSent() {
        this.lastSentAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}
