package com.kanban.domain.organization.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class OrgBoardRequest {

    @Getter
    @NoArgsConstructor
    public static class AddBoard {
        @NotBlank(message = "보드 ID는 필수입니다")
        private String boardId;
    }

    @Getter
    @NoArgsConstructor
    public static class CreateBoard {
        @NotBlank(message = "보드 이름은 필수입니다")
        @Size(max = 100, message = "보드 이름은 100자 이내여야 합니다")
        private String name;

        private String description;
    }
}
