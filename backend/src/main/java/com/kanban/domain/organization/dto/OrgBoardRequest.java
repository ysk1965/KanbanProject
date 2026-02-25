package com.kanban.domain.organization.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class OrgBoardRequest {

    @Getter
    @NoArgsConstructor
    public static class AddBoard {
        @NotBlank(message = "보드 ID는 필수입니다")
        private String boardId;
    }
}
