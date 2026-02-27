package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrganizationPosition;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

public class OrgPositionResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String name;
        private Integer displayOrder;
        private LocalDateTime createdAt;

        public static Detail of(OrganizationPosition position) {
            return Detail.builder()
                    .id(position.getId())
                    .name(position.getName())
                    .displayOrder(position.getDisplayOrder())
                    .createdAt(position.getCreatedAt())
                    .build();
        }
    }
}
