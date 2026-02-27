package com.kanban.domain.okr.dto;

import com.kanban.domain.okr.OkrObjective;
import com.kanban.domain.organization.OrganizationMember;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

public class OkrObjectiveResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String cycleId;
        private String title;
        private String description;
        private String level;
        private String departmentId;
        private String departmentName;
        private MemberInfo owner;
        private String parentObjectiveId;
        private int progress;
        private String confidence;
        private int sortOrder;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(OkrObjective obj) {
            return Detail.builder()
                    .id(obj.getId())
                    .cycleId(obj.getCycle().getId())
                    .title(obj.getTitle())
                    .description(obj.getDescription())
                    .level(obj.getLevel())
                    .departmentId(obj.getDepartment() != null ? obj.getDepartment().getId() : null)
                    .departmentName(obj.getDepartment() != null ? obj.getDepartment().getName() : null)
                    .owner(MemberInfo.of(obj.getOwner()))
                    .parentObjectiveId(obj.getParentObjective() != null ? obj.getParentObjective().getId() : null)
                    .progress(obj.getProgress())
                    .confidence(obj.getConfidence())
                    .sortOrder(obj.getSortOrder())
                    .createdAt(obj.getCreatedAt())
                    .updatedAt(obj.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MemberInfo {
        private String id;
        private String userName;
        private String profileImageUrl;

        public static MemberInfo of(OrganizationMember m) {
            if (m == null) return null;
            return MemberInfo.builder()
                    .id(m.getId())
                    .userName(m.getUser().getName())
                    .profileImageUrl(m.getUser().getProfileImage())
                    .build();
        }
    }
}
