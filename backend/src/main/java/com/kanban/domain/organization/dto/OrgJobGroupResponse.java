package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrganizationJobGroup;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

public class OrgJobGroupResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String name;
        private Integer displayOrder;
        private LocalDateTime createdAt;

        public static Detail of(OrganizationJobGroup jobGroup) {
            return Detail.builder()
                    .id(jobGroup.getId())
                    .name(jobGroup.getName())
                    .displayOrder(jobGroup.getDisplayOrder())
                    .createdAt(jobGroup.getCreatedAt())
                    .build();
        }
    }
}
