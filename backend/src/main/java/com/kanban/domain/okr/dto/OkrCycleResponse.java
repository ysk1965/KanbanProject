package com.kanban.domain.okr.dto;

import com.kanban.domain.okr.OkrCycle;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;

public class OkrCycleResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String organizationId;
        private String name;
        private String cycleType;
        private LocalDate startDate;
        private LocalDate endDate;
        private String status;
        private String createdBy;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(OkrCycle cycle) {
            return Detail.builder()
                    .id(cycle.getId())
                    .organizationId(cycle.getOrganization().getId())
                    .name(cycle.getName())
                    .cycleType(cycle.getCycleType())
                    .startDate(cycle.getStartDate())
                    .endDate(cycle.getEndDate())
                    .status(cycle.getStatus())
                    .createdBy(cycle.getCreatedBy().getId())
                    .createdAt(cycle.getCreatedAt())
                    .updatedAt(cycle.getUpdatedAt())
                    .build();
        }
    }
}
