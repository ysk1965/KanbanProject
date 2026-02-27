package com.kanban.domain.okr.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class OkrKeyResultRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "핵심 결과 제목은 필수입니다")
        @Size(max = 500, message = "핵심 결과 제목은 500자 이내여야 합니다")
        private String title;

        private String description;

        @NotBlank(message = "측정 유형은 필수입니다")
        private String metricType; // PERCENTAGE, NUMBER, CURRENCY, BOOLEAN, MILESTONE

        private double startValue;

        @NotNull(message = "목표값은 필수입니다")
        private Double targetValue;

        private double currentValue;
        private String unit;
        private String ownerId;
        private Double weight; // default 1.0
        private String linkedBoardId;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 500, message = "핵심 결과 제목은 500자 이내여야 합니다")
        private String title;

        private String description;
        private String metricType;
        private Double startValue;
        private Double targetValue;
        private String unit;
        private String ownerId;
        private Double weight;
        private String linkedBoardId;
    }
}
