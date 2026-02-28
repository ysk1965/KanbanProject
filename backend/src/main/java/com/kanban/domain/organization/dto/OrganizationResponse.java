package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrgRole;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.OrganizationMember;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

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
        private String currentPlan;
        private String subscriptionStatus;
        private String trialEndsAt;
        private boolean canCreateOrgBoard;
        private boolean canAccessHrFeatures;

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
                    .currentPlan(org.getCurrentPlan().name())
                    .subscriptionStatus(org.getSubscription() != null ? org.getSubscription().getStatus().name() : "ACTIVE")
                    .trialEndsAt(org.getSubscription() != null && org.getSubscription().getTrialEndsAt() != null
                            ? org.getSubscription().getTrialEndsAt().toString() : null)
                    .canCreateOrgBoard(org.getSubscription() != null && org.getSubscription().canCreateOrgBoard())
                    .canAccessHrFeatures(org.getSubscription() != null && org.getSubscription().canAccessHrFeatures())
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
        private String myMemberId;
        private int memberCount;
        private int boardCount;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private String currentPlan;
        private String subscriptionStatus;
        private String trialEndsAt;
        private boolean canCreateOrgBoard;
        private boolean canAccessHrFeatures;

        public static Detail of(Organization org, OrgRole myRole, String myMemberId, int memberCount, int boardCount) {
            return Detail.builder()
                    .id(org.getId())
                    .name(org.getName())
                    .description(org.getDescription())
                    .logoUrl(org.getLogoUrl())
                    .owner(OwnerInfo.of(org))
                    .myRole(myRole)
                    .myMemberId(myMemberId)
                    .memberCount(memberCount)
                    .boardCount(boardCount)
                    .createdAt(org.getCreatedAt())
                    .updatedAt(org.getUpdatedAt())
                    .currentPlan(org.getCurrentPlan().name())
                    .subscriptionStatus(org.getSubscription() != null ? org.getSubscription().getStatus().name() : "ACTIVE")
                    .trialEndsAt(org.getSubscription() != null && org.getSubscription().getTrialEndsAt() != null
                            ? org.getSubscription().getTrialEndsAt().toString() : null)
                    .canCreateOrgBoard(org.getSubscription() != null && org.getSubscription().canCreateOrgBoard())
                    .canAccessHrFeatures(org.getSubscription() != null && org.getSubscription().canAccessHrFeatures())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class StructureSettings {
        private Boolean departmentsEnabled;
        private Boolean jobGroupsEnabled;
        private Boolean positionsEnabled;
        private Boolean titlesEnabled;
        private Boolean gradesEnabled;

        public static StructureSettings of(Organization org) {
            return StructureSettings.builder()
                    .departmentsEnabled(org.getDepartmentsEnabled())
                    .jobGroupsEnabled(org.getJobGroupsEnabled())
                    .positionsEnabled(org.getPositionsEnabled())
                    .titlesEnabled(org.getTitlesEnabled())
                    .gradesEnabled(org.getGradesEnabled())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class StructureData {
        private StructureSettings settings;
        private List<OrgDepartmentResponse.Detail> departments;
        private List<OrgJobGroupResponse.Detail> jobGroups;
        private List<OrgPositionResponse.Detail> positions;
        private List<OrgTitleResponse.Detail> titles;
        private List<OrgGradeResponse.Detail> grades;
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
