package com.kanban.domain.okr.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class OkrCheckInRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotNull(message = "새 값은 필수입니다")
        private Double newValue;

        @NotBlank(message = "신뢰도는 필수입니다")
        private String confidence; // ON_TRACK, AT_RISK, OFF_TRACK

        private String note;
    }
}
