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
        private LocalDateTime createdAt;

        public static Detail of(OrganizationDepartment dept) {
            return Detail.builder()
                    .id(dept.getId())
                    .name(dept.getName())
                    .displayOrder(dept.getDisplayOrder())
                    .createdAt(dept.getCreatedAt())
                    .build();
        }
    }
}
