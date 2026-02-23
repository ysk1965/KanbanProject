package com.kanban.domain.board.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class BoardRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "보드 이름은 필수입니다")
        @Size(max = 100, message = "보드 이름은 100자 이내여야 합니다")
        private String name;

        private String description;

        private String backgroundGradient;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 100, message = "보드 이름은 100자 이내여야 합니다")
        private String name;

        private String description;

        private String backgroundGradient;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateSelectedMilestone {
        private String milestoneId;
    }
}
