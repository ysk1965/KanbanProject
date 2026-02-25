package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrgRole;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class OrgInviteRequest {

    @Getter
    @NoArgsConstructor
    public static class Create {
        private OrgRole role;
        private Integer maxUses;
        private Integer expiresInDays;
    }
}
