package com.kanban.domain.invite.dto;

import com.kanban.domain.board.BoardRole;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class InviteRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        private BoardRole role;
        private Integer maxUses;
        private Integer expiresInHours; // 몇 시간 후 만료
    }
}
