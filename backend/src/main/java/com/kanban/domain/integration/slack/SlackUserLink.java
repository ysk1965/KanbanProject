package com.kanban.domain.integration.slack;

import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "slack_user_links", indexes = {
    @Index(name = "idx_slack_user_link_slack_id", columnList = "slack_user_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SlackUserLink {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Column(name = "slack_user_id", nullable = false, unique = true, length = 30)
    private String slackUserId;

    @Column(name = "slack_username", length = 200)
    private String slackUsername;

    @Column(name = "slack_team_id", length = 30)
    private String slackTeamId;

    @Column(name = "access_token", length = 500)
    private String accessToken;

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

    public void updateUsername(String slackUsername) {
        if (slackUsername != null) this.slackUsername = slackUsername;
    }
}
