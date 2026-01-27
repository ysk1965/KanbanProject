package com.kanban.domain.admin.dto;

import com.kanban.domain.board.BoardTier;
import com.kanban.domain.user.SystemRole;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class AdminRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateUser {
        @NotNull(message = "시스템 역할은 필수입니다")
        private SystemRole systemRole;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateBoardTier {
        @NotNull(message = "Tier는 필수입니다")
        private BoardTier tier;
    }
}
