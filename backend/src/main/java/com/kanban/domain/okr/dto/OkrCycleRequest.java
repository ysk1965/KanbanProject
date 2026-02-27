package com.kanban.domain.okr.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

public class OkrCycleRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "사이클 이름은 필수입니다")
        @Size(max = 100, message = "사이클 이름은 100자 이내여야 합니다")
        private String name;

        @NotBlank(message = "사이클 유형은 필수입니다")
        private String cycleType; // QUARTERLY, HALF_YEARLY, YEARLY, CUSTOM

        @NotNull(message = "시작일은 필수입니다")
        private LocalDate startDate;

        @NotNull(message = "종료일은 필수입니다")
        private LocalDate endDate;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 100, message = "사이클 이름은 100자 이내여야 합니다")
        private String name;

        private String cycleType;
        private LocalDate startDate;
        private LocalDate endDate;
        private String status; // PLANNING, ACTIVE, REVIEW, CLOSED
    }
}
