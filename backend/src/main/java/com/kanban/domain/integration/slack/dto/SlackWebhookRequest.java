package com.kanban.domain.integration.slack.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class SlackWebhookRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Upsert {
        private String webhookUrl;

        private String channelName;

        private Boolean enabled;
    }
}
