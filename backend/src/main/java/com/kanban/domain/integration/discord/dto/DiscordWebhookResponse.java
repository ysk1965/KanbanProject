package com.kanban.domain.integration.discord.dto;

import com.kanban.domain.integration.discord.MemberDiscordWebhook;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

public class DiscordWebhookResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String boardId;
        private String webhookUrlMasked;
        private String channelName;
        private boolean enabled;
        private String createdAt;
        private String updatedAt;

        public static Detail of(MemberDiscordWebhook webhook) {
            return Detail.builder()
                    .id(webhook.getId())
                    .boardId(webhook.getBoard().getId())
                    .webhookUrlMasked(maskWebhookUrl(webhook.getWebhookUrl()))
                    .channelName(webhook.getChannelName())
                    .enabled(webhook.getEnabled())
                    .createdAt(webhook.getCreatedAt() != null ? webhook.getCreatedAt() + "Z" : null)
                    .updatedAt(webhook.getUpdatedAt() != null ? webhook.getUpdatedAt() + "Z" : null)
                    .build();
        }

        private static String maskWebhookUrl(String url) {
            // Discord webhook URL format: https://discord.com/api/webhooks/{webhookId}/{token}
            if (url == null || !url.contains("/api/webhooks/")) {
                return "https://discord.com/api/webhooks/***/***";
            }
            String webhookPart = url.substring(url.indexOf("/api/webhooks/") + "/api/webhooks/".length());
            String[] parts = webhookPart.split("/");
            if (parts.length >= 2) {
                String webhookId = parts[0];
                String token = parts[1];
                String idMasked = webhookId.length() > 4
                        ? webhookId.substring(0, Math.min(4, webhookId.length())) + "***"
                        : "***";
                String tokenLastFour = token.length() > 4 ? token.substring(token.length() - 4) : token;
                return "https://discord.com/api/webhooks/" + idMasked + "/****" + tokenLastFour;
            }
            return "https://discord.com/api/webhooks/***/***";
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TestResult {
        private boolean success;
        private String message;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MemberStatus {
        private String userId;
        private boolean connected;
        private boolean enabled;
        private String channelName;

        public static MemberStatus of(MemberDiscordWebhook webhook) {
            return MemberStatus.builder()
                    .userId(webhook.getUser().getId())
                    .connected(true)
                    .enabled(webhook.getEnabled())
                    .channelName(webhook.getChannelName())
                    .build();
        }
    }
}
