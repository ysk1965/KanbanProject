package com.kanban.domain.integration.slack.dto;

import com.kanban.domain.integration.slack.SlackInstallation;
import com.kanban.domain.integration.slack.SlackInstallScope;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class SlackAppResponse {

    @Getter
    @Builder
    public static class InstallUrl {
        private String url;
    }

    @Getter
    @Builder
    public static class Installation {
        private String id;
        private SlackInstallScope scope;
        private String slackTeamId;
        private String slackTeamName;
        private String botUserId;
        private boolean active;
        private String installedByName;
        private String defaultChannelId;
        private String defaultChannelName;
        private String scopes;
        private LocalDateTime createdAt;

        public static Installation from(SlackInstallation entity) {
            return Installation.builder()
                    .id(entity.getId())
                    .scope(entity.getScope())
                    .slackTeamId(entity.getSlackTeamId())
                    .slackTeamName(entity.getSlackTeamName())
                    .botUserId(entity.getBotUserId())
                    .active(entity.getActive())
                    .installedByName(entity.getInstalledBy() != null ? entity.getInstalledBy().getName() : null)
                    .defaultChannelId(entity.getDefaultChannelId())
                    .defaultChannelName(entity.getDefaultChannelName())
                    .scopes(entity.getScopes())
                    .createdAt(entity.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class Channel {
        private String id;
        private String name;
        private boolean isPrivate;
        private boolean isArchived;
        private int memberCount;
    }

    @Getter
    @Builder
    public static class ChannelList {
        private List<Channel> channels;
        private String nextCursor;
    }

    @Getter
    @Builder
    public static class OAuthCallback {
        private Installation installation;
        private String redirectPath;
        private String origin;
    }

    @Getter
    @Builder
    public static class UserLinkCallback {
        private String redirectPath;
        private String origin;
    }

    @Getter
    @Builder
    public static class UserLinkStatus {
        private boolean linked;
        private String slackUserId;
        private String slackUsername;
        private String slackTeamId;
    }

    @Getter
    @Builder
    public static class MemberSlackStatus {
        private String userId;
        private boolean linked;
        private String slackUsername;
    }

    @Getter
    @Builder
    public static class TestResult {
        private boolean success;
        private String message;
    }
}
