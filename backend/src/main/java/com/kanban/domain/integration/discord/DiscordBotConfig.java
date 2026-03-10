package com.kanban.domain.integration.discord;

import com.kanban.domain.board.Board;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "discord_bot_configs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DiscordBotConfig {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false, unique = true)
    private Board board;

    @Column(name = "guild_id", nullable = false, length = 30)
    private String guildId;

    @Column(name = "guild_name", length = 200)
    private String guildName;

    @Column(name = "channel_id", length = 30)
    private String channelId;

    @Column(name = "channel_name", length = 200)
    private String channelName;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "installed_by", nullable = false)
    private User installedBy;

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

    public void updateChannel(String channelId, String channelName) {
        this.channelId = channelId;
        this.channelName = channelName;
    }

    public void updateGuildInfo(String guildId, String guildName) {
        this.guildId = guildId;
        this.guildName = guildName;
    }
}
