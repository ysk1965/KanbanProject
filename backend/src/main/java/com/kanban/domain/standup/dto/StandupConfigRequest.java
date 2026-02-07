package com.kanban.domain.standup.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class StandupConfigRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Upsert {
        @NotNull
        private Boolean enabled;

        @NotNull
        @Min(0) @Max(23)
        private Integer sendHour;

        @NotNull
        @Min(0) @Max(59)
        private Integer sendMinute;

        @NotNull
        private String timezone;

        private String language;
    }
}
