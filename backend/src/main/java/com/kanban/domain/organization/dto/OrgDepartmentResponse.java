package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrganizationDepartment;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

public class OrgDepartmentResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String name;
        private Integer displayOrder;
        private String parentDepartmentId;
        private String leaderId;
        private String leaderName;
        private String leaderProfileImage;
        private String description;
        private LocalDateTime createdAt;

        public static Detail of(OrganizationDepartment dept) {
            return Detail.builder()
                    .id(dept.getId())
                    .name(dept.getName())
                    .displayOrder(dept.getDisplayOrder())
                    .parentDepartmentId(dept.getParentDepartment() != null ? dept.getParentDepartment().getId() : null)
                    .leaderId(dept.getLeader() != null ? dept.getLeader().getId() : null)
                    .leaderName(dept.getLeader() != null ? dept.getLeader().getUser().getName() : null)
                    .leaderProfileImage(dept.getLeader() != null ? dept.getLeader().getUser().getProfileImage() : null)
                    .description(dept.getDescription())
                    .createdAt(dept.getCreatedAt())
                    .build();
        }
    }
}
