package com.kanban.domain.okr.dto;

import com.kanban.domain.okr.OkrKeyResult;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

public class OkrKeyResultResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String objectiveId;
        private String title;
        private String description;
        private String metricType;
        private double startValue;
        private double targetValue;
        private double currentValue;
        private String unit;
        private OkrObjectiveResponse.MemberInfo owner;
        private double weight;
        private String linkedBoardId;
        private int sortOrder;
        private String lastCheckinAt;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(OkrKeyResult kr) {
            return of(kr, null);
        }

        public static Detail of(OkrKeyResult kr, String lastCheckinAt) {
            return Detail.builder()
                    .id(kr.getId())
                    .objectiveId(kr.getObjective().getId())
                    .title(kr.getTitle())
                    .description(kr.getDescription())
                    .metricType(kr.getMetricType())
                    .startValue(kr.getStartValue())
                    .targetValue(kr.getTargetValue())
                    .currentValue(kr.getCurrentValue())
                    .unit(kr.getUnit())
                    .owner(OkrObjectiveResponse.MemberInfo.of(kr.getOwner()))
                    .weight(kr.getWeight())
                    .linkedBoardId(kr.getLinkedBoard() != null ? kr.getLinkedBoard().getId() : null)
                    .sortOrder(kr.getSortOrder())
                    .lastCheckinAt(lastCheckinAt)
                    .createdAt(kr.getCreatedAt())
                    .updatedAt(kr.getUpdatedAt())
                    .build();
        }
    }
}
