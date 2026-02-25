package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrgRole;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.OrganizationMember;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

public class OrganizationResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Simple {
        private String id;
        private String name;
        private String description;
        private String logoUrl;
        private OrgRole myRole;
        private int memberCount;
        private int boardCount;
        private LocalDateTime createdAt;

        public static Simple of(Organization org, OrgRole myRole, int memberCount, int boardCount) {
            return Simple.builder()
                    .id(org.getId())
                    .name(org.getName())
                    .description(org.getDescription())
                    .logoUrl(org.getLogoUrl())
                    .myRole(myRole)
                    .memberCount(memberCount)
                    .boardCount(boardCount)
                    .createdAt(org.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String name;
        private String description;
        private String logoUrl;
        private OwnerInfo owner;
        private OrgRole myRole;
        private int memberCount;
        private int boardCount;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(Organization org, OrgRole myRole, int memberCount, int boardCount) {
            return Detail.builder()
                    .id(org.getId())
                    .name(org.getName())
                    .description(org.getDescription())
                    .logoUrl(org.getLogoUrl())
                    .owner(OwnerInfo.of(org))
                    .myRole(myRole)
                    .memberCount(memberCount)
                    .boardCount(boardCount)
                    .createdAt(org.getCreatedAt())
                    .updatedAt(org.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class OwnerInfo {
        private String id;
        private String name;
        private String email;
        private String profileImage;

        public static OwnerInfo of(Organization org) {
            return OwnerInfo.builder()
                    .id(org.getOwner().getId())
                    .name(org.getOwner().getName())
                    .email(org.getOwner().getEmail())
                    .profileImage(org.getOwner().getProfileImage())
                    .build();
        }
    }
}
