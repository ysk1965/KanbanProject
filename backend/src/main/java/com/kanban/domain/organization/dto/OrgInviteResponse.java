package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrgRole;
import com.kanban.domain.organization.OrganizationInviteLink;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

public class OrgInviteResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String code;
        private OrgRole role;
        private Integer maxUses;
        private Integer usedCount;
        private LocalDateTime expiresAt;
        private Boolean isActive;
        private String createdByName;
        private LocalDateTime createdAt;

        public static Detail of(OrganizationInviteLink link) {
            return Detail.builder()
                    .id(link.getId())
                    .code(link.getCode())
                    .role(link.getRole())
                    .maxUses(link.getMaxUses())
                    .usedCount(link.getUsedCount())
                    .expiresAt(link.getExpiresAt())
                    .isActive(link.getIsActive())
                    .createdByName(link.getCreatedBy() != null ? link.getCreatedBy().getName() : null)
                    .createdAt(link.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PublicInfo {
        private String organizationName;
        private String logoUrl;
        private int memberCount;
        private OrgRole role;
    }
}
