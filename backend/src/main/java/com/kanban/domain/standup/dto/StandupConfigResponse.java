package com.kanban.domain.standup.dto;

import com.kanban.domain.standup.DailyStandupConfig;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

public class StandupConfigResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String boardId;
        private boolean enabled;
        private int sendHourUtc;
        private int sendMinuteUtc;
        private String timezone;
        private String language;
        private String lastSentAt;
        private String createdAt;
        private String updatedAt;

        public static Detail from(DailyStandupConfig config) {
            return Detail.builder()
                    .id(config.getId())
                    .boardId(config.getBoard().getId())
                    .enabled(config.getEnabled())
                    .sendHourUtc(config.getSendHourUtc())
                    .sendMinuteUtc(config.getSendMinuteUtc())
                    .timezone(config.getTimezone())
                    .language(config.getLanguage())
                    .lastSentAt(config.getLastSentAt() != null
                            ? config.getLastSentAt().toString() + "Z" : null)
                    .createdAt(config.getCreatedAt().toString() + "Z")
                    .updatedAt(config.getUpdatedAt().toString() + "Z")
                    .build();
        }
    }
}
