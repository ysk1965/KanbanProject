package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrganizationTitle;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

public class OrgTitleResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String name;
        private Integer displayOrder;
        private LocalDateTime createdAt;

        public static Detail of(OrganizationTitle title) {
            return Detail.builder()
                    .id(title.getId())
                    .name(title.getName())
                    .displayOrder(title.getDisplayOrder())
                    .createdAt(title.getCreatedAt())
                    .build();
        }
    }
}
