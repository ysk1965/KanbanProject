package com.kanban.domain.milestone.dto;

import com.kanban.domain.feature.Feature;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneAllocation;
import com.kanban.domain.user.User;
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

    // ==================== Allocation DTOs ====================

    @Getter
    @AllArgsConstructor
    @Builder
    public static class AllocationDto {
        private String id;
        private String milestoneId;
        private MemberInfo member;
        private Integer workingDays;
        private Double totalAllocatedHours;
        private Double actualWorkedHours;
        private Double difference;
        private String status;  // OVER, UNDER, NORMAL

        public static AllocationDto of(MilestoneAllocation allocation, Double actualWorkedHours) {
            Double allocated = allocation.getTotalAllocatedHours();
            Double difference = actualWorkedHours != null && allocated != null
                    ? actualWorkedHours - allocated
                    : null;
            String status = determineStatus(allocated, actualWorkedHours);

            return AllocationDto.builder()
                    .id(allocation.getId())
                    .milestoneId(allocation.getMilestone().getId())
                    .member(MemberInfo.of(allocation.getMember()))
                    .workingDays(allocation.getWorkingDays())
                    .totalAllocatedHours(allocated)
                    .actualWorkedHours(actualWorkedHours)
                    .difference(difference != null ? Math.round(difference * 100.0) / 100.0 : null)
                    .status(status)
                    .build();
        }

        private static String determineStatus(Double allocated, Double actual) {
            if (allocated == null || actual == null) {
                return "NORMAL";
            }
            double diff = actual - allocated;
            if (diff > allocated * 0.1) {  // 10% 초과
                return "OVER";
            } else if (diff < -allocated * 0.1) {  // 10% 미달
                return "UNDER";
            }
            return "NORMAL";
        }
    }

    @Getter
    @AllArgsConstructor
    @Builder
    public static class MemberInfo {
        private String id;
        private String name;
        private String profileImage;

        public static MemberInfo of(User user) {
            return MemberInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .profileImage(user.getProfileImage())
                    .build();
        }
    }

    @Getter
    @AllArgsConstructor
    @Builder
    public static class AllocationListResponse {
        private List<AllocationDto> allocations;
        private Double totalAllocatedHours;
        private Double totalActualHours;
        private Double defaultHoursPerDay;

        public static AllocationListResponse of(List<AllocationDto> allocations, Double defaultHoursPerDay) {
            double totalAllocated = allocations.stream()
                    .filter(a -> a.getTotalAllocatedHours() != null)
                    .mapToDouble(AllocationDto::getTotalAllocatedHours)
                    .sum();
            double totalActual = allocations.stream()
                    .filter(a -> a.getActualWorkedHours() != null)
                    .mapToDouble(AllocationDto::getActualWorkedHours)
                    .sum();

            return AllocationListResponse.builder()
                    .allocations(allocations)
                    .totalAllocatedHours(Math.round(totalAllocated * 100.0) / 100.0)
                    .totalActualHours(Math.round(totalActual * 100.0) / 100.0)
                    .defaultHoursPerDay(defaultHoursPerDay)
                    .build();
        }
    }
}
