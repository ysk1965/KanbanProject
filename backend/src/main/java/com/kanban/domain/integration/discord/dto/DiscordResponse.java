package com.kanban.domain.integration.discord.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

public class DiscordResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BotConfig {
        private String boardId;
        private String guildId;
        private String guildName;
        private String channelId;
        private String channelName;
        private boolean botConnected;
        private String installedBy;
        private String createdAt;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class UserLinkStatus {
        private boolean linked;
        private String discordUserId;
        private String discordUsername;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ChannelInfo {
        private String id;
        private String name;
        private int type;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MemberStatus {
        private String userId;
        private boolean linked;
        private String discordUsername;
        private boolean enabled;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class OAuthUrl {
        private String oauthUrl;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TestResult {
        private boolean success;
        private String message;
    }
}
