package com.kanban.domain.okr.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
@AllArgsConstructor
public class OkrTreeResponse {
    private CycleInfo cycle;
    private int overallProgress;
    private int totalObjectives;
    private int totalKeyResults;
    private List<ObjectiveNode> objectives; // Root Objectives (parentObjectiveId == null)

    @Getter
    @Builder
    @AllArgsConstructor
    public static class CycleInfo {
        private String id;
        private String name;
        private String status;
        private String startDate;
        private String endDate;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ObjectiveNode {
        private String id;
        private String title;
        private String description;
        private String level;
        private String departmentId;
        private String departmentName;
        private OkrObjectiveResponse.MemberInfo owner;
        private int progress;
        private String confidence;
        private int sortOrder;
        private List<KeyResultNode> keyResults;
        private List<ObjectiveNode> children; // Child Objectives (recursive)
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class KeyResultNode {
        private String id;
        private String title;
        private String metricType;
        private double startValue;
        private double targetValue;
        private double currentValue;
        private String unit;
        private OkrObjectiveResponse.MemberInfo owner;
        private double weight;
        private String linkedBoardId;
        private String lastCheckinAt;
    }
}
