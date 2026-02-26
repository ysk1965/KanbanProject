package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrganizationGrade;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

public class OrgGradeResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String name;
        private Integer displayOrder;
        private LocalDateTime createdAt;

        public static Detail of(OrganizationGrade grade) {
            return Detail.builder()
                    .id(grade.getId())
                    .name(grade.getName())
                    .displayOrder(grade.getDisplayOrder())
                    .createdAt(grade.getCreatedAt())
                    .build();
        }
    }
}
