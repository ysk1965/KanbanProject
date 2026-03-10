package com.kanban.domain.integration.discord.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class DiscordRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateChannel {
        private String channelId;
    }
}
