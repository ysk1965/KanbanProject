package com.kanban.domain.integration.slack.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

public class SlackAppRequest {

    @Getter
    @Setter
    @NoArgsConstructor
    public static class SetChannel {
        private String channelId;
        private String channelName;
    }
}
