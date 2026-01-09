package com.kanban.domain.feature.dto;

import com.kanban.domain.feature.Priority;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

public class FeatureRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "Feature 제목은 필수입니다")
        @Size(max = 200, message = "Feature 제목은 200자 이내여야 합니다")
        private String title;

        private String description;

        @Size(max = 20, message = "색상 코드는 20자 이내여야 합니다")
        private String color;

        private String assigneeId;

        private Priority priority;

        private LocalDate dueDate;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 200, message = "Feature 제목은 200자 이내여야 합니다")
        private String title;

        private String description;

        @Size(max = 20, message = "색상 코드는 20자 이내여야 합니다")
        private String color;

        private String assigneeId;

        private Priority priority;

        private LocalDate dueDate;
    }

    @Getter
    @NoArgsConstructor
    public static class Reorder {
        @NotNull(message = "Feature ID 목록은 필수입니다")
        private List<String> featureIds;
    }
}
