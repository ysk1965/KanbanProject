package com.kanban.domain.integration.slack;

import com.kanban.domain.board.Board;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "slack_installations", indexes = {
    @Index(name = "idx_slack_installation_board", columnList = "board_id"),
    @Index(name = "idx_slack_installation_organization", columnList = "organization_id"),
    @Index(name = "idx_slack_installation_team", columnList = "slack_team_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SlackInstallation {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id")
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id")
    private Organization organization;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", nullable = false, length = 20)
    private SlackInstallScope scope;

    @Column(name = "slack_team_id", nullable = false, length = 20)
    private String slackTeamId;

    @Column(name = "slack_team_name", length = 200)
    private String slackTeamName;

    @Column(name = "bot_token_encrypted", nullable = false, length = 500)
    private String botTokenEncrypted;

    @Column(name = "bot_user_id", length = 20)
    private String botUserId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "installed_by", nullable = false)
    private User installedBy;

    @Column(name = "slack_installer_user_id", length = 20)
    private String slackInstallerUserId;

    @Column(name = "default_channel_id", length = 30)
    private String defaultChannelId;

    @Column(name = "default_channel_name", length = 100)
    private String defaultChannelName;

    @Column(name = "scopes", length = 1000)
    private String scopes;

    @Column(name = "active", nullable = false)
    @Builder.Default
    private Boolean active = true;

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

    public void deactivate() {
        this.active = false;
    }

    /**
     * Re-install onto the existing row (same team + board/org) instead of inserting
     * a new row. The unique constraint uk_slack_install_team_{board,org} spans only
     * (slack_team_id, board_id/organization_id) and ignores {@code active}, so the old
     * "deactivate + insert new" flow collided on re-install. Updating in place keeps a
     * single row per (team, entity) and reactivates it with the fresh OAuth grant.
     */
    public void reinstall(String slackTeamName, String botTokenEncrypted, String botUserId,
                          User installedBy, String slackInstallerUserId, String scopes) {
        this.slackTeamName = slackTeamName;
        this.botTokenEncrypted = botTokenEncrypted;
        this.botUserId = botUserId;
        this.installedBy = installedBy;
        this.slackInstallerUserId = slackInstallerUserId;
        this.scopes = scopes;
        this.active = true;
    }

    public void updateDefaultChannel(String channelId, String channelName) {
        this.defaultChannelId = channelId;
        this.defaultChannelName = channelName;
    }
}
