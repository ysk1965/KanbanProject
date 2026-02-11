package com.kanban.domain.checklist.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

public class ChecklistRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "체크리스트 항목 제목은 필수입니다")
        @Size(max = 200, message = "체크리스트 항목 제목은 200자 이내여야 합니다")
        private String title;

        private String assigneeId;

        private LocalDate startDate;

        private LocalDate dueDate;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 200, message = "체크리스트 항목 제목은 200자 이내여야 합니다")
        private String title;

        private String assigneeId;

        private LocalDate startDate;

        private LocalDate dueDate;
    }

    @Getter
    @NoArgsConstructor
    public static class MoveTask {
        @NotNull(message = "이동할 Task ID는 필수입니다")
        private String targetTaskId;
    }

    @Getter
    @NoArgsConstructor
    public static class Reorder {
        @NotNull(message = "항목 ID 목록은 필수입니다")
        private List<String> itemIds;
    }
}
