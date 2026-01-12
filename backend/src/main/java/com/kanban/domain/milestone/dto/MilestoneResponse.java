package com.kanban.domain.milestone.dto;

import com.kanban.domain.feature.Feature;
import com.kanban.domain.milestone.Milestone;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class MilestoneResponse {

    @Getter
    @AllArgsConstructor
    @Builder
    public static class Simple {
        private String id;
        private String title;
        private LocalDate startDate;
        private LocalDate endDate;
        private int featureCount;
        private int progressPercentage;

        public static Simple of(Milestone milestone, int featureCount, int progressPercentage) {
            return Simple.builder()
                    .id(milestone.getId())
                    .title(milestone.getTitle())
                    .startDate(milestone.getStartDate())
                    .endDate(milestone.getEndDate())
                    .featureCount(featureCount)
                    .progressPercentage(progressPercentage)
                    .build();
        }
    }

    @Getter
    @AllArgsConstructor
    @Builder
    public static class Detail {
        private String id;
        private String title;
        private String description;
        private LocalDate startDate;
        private LocalDate endDate;
        private int featureCount;
        private int progressPercentage;
        private List<FeatureInfo> features;
        private CreatorInfo createdBy;
        private LocalDateTime createdAt;

        public static Detail of(Milestone milestone, List<Feature> features, int progressPercentage) {
            List<FeatureInfo> featureInfos = features.stream()
                    .map(FeatureInfo::of)
                    .toList();

            return Detail.builder()
                    .id(milestone.getId())
                    .title(milestone.getTitle())
                    .description(milestone.getDescription())
                    .startDate(milestone.getStartDate())
                    .endDate(milestone.getEndDate())
                    .featureCount(features.size())
                    .progressPercentage(progressPercentage)
                    .features(featureInfos)
                    .createdBy(CreatorInfo.of(milestone.getCreatedBy()))
                    .createdAt(milestone.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @AllArgsConstructor
    @Builder
    public static class ListResponse {
        private List<Simple> milestones;

        public static ListResponse of(List<Milestone> milestones,
                                      java.util.Map<String, Integer> featureCountMap,
                                      java.util.Map<String, Integer> progressMap) {
            List<Simple> simpleList = milestones.stream()
                    .map(m -> Simple.of(
                            m,
                            featureCountMap.getOrDefault(m.getId(), 0),
                            progressMap.getOrDefault(m.getId(), 0)
                    ))
                    .toList();
            return new ListResponse(simpleList);
        }
    }

    @Getter
    @AllArgsConstructor
    @Builder
    public static class FeatureInfo {
        private String id;
        private String title;
        private String color;
        private int totalTasks;
        private int completedTasks;
        private int progressPercentage;

        public static FeatureInfo of(Feature feature) {
            return FeatureInfo.builder()
                    .id(feature.getId())
                    .title(feature.getTitle())
                    .color(feature.getColor())
                    .totalTasks(feature.getTotalTasks())
                    .completedTasks(feature.getCompletedTasks())
                    .progressPercentage(feature.getProgressPercentage())
                    .build();
        }
    }

    @Getter
    @AllArgsConstructor
    @Builder
    public static class CreatorInfo {
        private String id;
        private String name;

        public static CreatorInfo of(com.kanban.domain.user.User user) {
            return CreatorInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .build();
        }
    }
}
