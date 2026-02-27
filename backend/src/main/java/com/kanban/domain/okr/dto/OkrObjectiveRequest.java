package com.kanban.domain.okr.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class OkrObjectiveRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        @NotBlank(message = "목표 제목은 필수입니다")
        @Size(max = 500, message = "목표 제목은 500자 이내여야 합니다")
        private String title;

        private String description;

        @NotBlank(message = "목표 레벨은 필수입니다")
        private String level; // COMPANY, DEPARTMENT, INDIVIDUAL

        private String departmentId;
        private String ownerId;
        private String parentObjectiveId;
    }

    @Getter
    @NoArgsConstructor
    public static class Update {
        @Size(max = 500, message = "목표 제목은 500자 이내여야 합니다")
        private String title;

        private String description;
        private String level;
        private String departmentId;
        private String ownerId;
        private String parentObjectiveId;
    }
}
