package com.kanban.domain.integration.slack;

import com.kanban.domain.board.Board;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "member_slack_webhooks", indexes = {
    @Index(name = "idx_slack_webhook_board_enabled", columnList = "board_id, enabled")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MemberSlackWebhook {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "webhook_url", nullable = false, length = 500)
    private String webhookUrl;

    @Column(name = "channel_name", length = 100)
    private String channelName;

    @Column(name = "enabled", nullable = false)
    @Builder.Default
    private Boolean enabled = true;

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

    public void update(String webhookUrl, String channelName, Boolean enabled) {
        if (webhookUrl != null) this.webhookUrl = webhookUrl;
        if (channelName != null) this.channelName = channelName;
        if (enabled != null) this.enabled = enabled;
    }
}
