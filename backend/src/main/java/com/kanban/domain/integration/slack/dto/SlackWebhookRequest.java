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
        @NotBlank(message = "Webhook URL은 필수입니다")
        private String webhookUrl;

        private String channelName;

        private Boolean enabled;
    }
}
