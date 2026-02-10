package com.kanban.domain.task.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

public class TaskRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "Task 제목은 필수입니다")
        @Size(max = 200, message = "Task 제목은 200자 이내여야 합니다")
        private String title;

        private String description;

        private LocalDate startDate;

        private LocalDate dueDate;

        private Integer estimatedMinutes;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 200, message = "Task 제목은 200자 이내여야 합니다")
        private String title;

        private String description;

        private LocalDate startDate;

        private LocalDate dueDate;

        private Integer estimatedMinutes;
    }

    @Getter
    @NoArgsConstructor
    public static class Move {
        @NotNull(message = "이동할 블록 ID는 필수입니다")
        private String targetBlockId;

        private Integer position;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateDates {
        private LocalDate startDate;

        private LocalDate endDate;
    }

    @Getter
    @NoArgsConstructor
    public static class MoveFeature {
        @NotNull(message = "이동할 Feature ID는 필수입니다")
        private String targetFeatureId;
    }
}
