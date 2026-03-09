package com.kanban.domain.integration.discord.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class DiscordWebhookRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Upsert {
        private String webhookUrl;

        private String channelName;

        private Boolean enabled;
    }
}
