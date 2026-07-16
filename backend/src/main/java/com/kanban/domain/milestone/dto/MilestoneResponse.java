package com.kanban.domain.milestone.dto;

import com.kanban.domain.feature.Feature;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneAllocation;
import com.kanban.domain.milestone.MilestoneFeature;
import com.kanban.domain.user.User;
import com.kanban.global.util.UtilizationStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

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

    /**
     * 상세 정보가 포함된 마일스톤 응답 (features 포함)
     * N+1 문제 해결을 위해 getMilestones에서 사용
     */
    @Getter
    @AllArgsConstructor
    @Builder
    public static class DetailSimple {
        private String id;
        private String title;
        private String description;
        private LocalDate startDate;
        private LocalDate endDate;
        private int featureCount;
        private int progressPercentage;
        private Boolean isDefault;
        private List<FeatureInfo> features;
        private CreatorInfo createdBy;
        private LocalDateTime createdAt;

        public static DetailSimple of(Milestone milestone, List<MilestoneFeature> links, int progressPercentage,
                                      Map<String, int[]> featureCounts, Map<String, String> homeByFeature) {
            List<FeatureInfo> featureInfos = links.stream()
                    .map(link -> {
                        int[] c = featureCounts.getOrDefault(link.getFeature().getId(), new int[]{0, 0});
                        boolean isHome = milestone.getId().equals(homeByFeature.get(link.getFeature().getId()));
                        return FeatureInfo.of(link, c[0], c[1], isHome);
                    })
                    .toList();

            return DetailSimple.builder()
                    .id(milestone.getId())
                    .title(milestone.getTitle())
                    .description(milestone.getDescription())
                    .startDate(milestone.getStartDate())
                    .endDate(milestone.getEndDate())
                    .featureCount(links.size())
                    .progressPercentage(progressPercentage)
                    .isDefault(milestone.getIsDefault())
                    .features(featureInfos)
                    .createdBy(CreatorInfo.of(milestone.getCreatedBy()))
                    .createdAt(milestone.getCreatedAt())
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
        private Boolean isDefault;
        private List<FeatureInfo> features;
        private CreatorInfo createdBy;
        private LocalDateTime createdAt;

        public static Detail of(Milestone milestone, List<MilestoneFeature> links, int progressPercentage,
                                Map<String, int[]> featureCounts, Map<String, String> homeByFeature) {
            List<FeatureInfo> featureInfos = links.stream()
                    .map(link -> {
                        int[] c = featureCounts.getOrDefault(link.getFeature().getId(), new int[]{0, 0});
                        boolean isHome = milestone.getId().equals(homeByFeature.get(link.getFeature().getId()));
                        return FeatureInfo.of(link, c[0], c[1], isHome);
                    })
                    .toList();

            return Detail.builder()
                    .id(milestone.getId())
                    .title(milestone.getTitle())
                    .description(milestone.getDescription())
                    .startDate(milestone.getStartDate())
                    .endDate(milestone.getEndDate())
                    .featureCount(links.size())
                    .progressPercentage(progressPercentage)
                    .isDefault(milestone.getIsDefault())
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
        private List<DetailSimple> milestones;

        /**
         * N+1 문제 해결을 위해 features를 포함한 상세 응답 생성
         */
        public static ListResponse of(List<Milestone> milestones,
                                      Map<String, List<MilestoneFeature>> linksMap,
                                      Map<String, Integer> progressMap,
                                      Map<String, Map<String, int[]>> countsMap,
                                      Map<String, String> homeByFeature) {
            List<DetailSimple> detailList = milestones.stream()
                    .map(m -> DetailSimple.of(
                            m,
                            linksMap.getOrDefault(m.getId(), List.of()),
                            progressMap.getOrDefault(m.getId(), 0),
                            countsMap.getOrDefault(m.getId(), Map.of()),
                            homeByFeature
                    ))
                    .toList();
            return new ListResponse(detailList);
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
        private boolean isPrimary;

        /**
         * 마일스톤-스코프 카운트로 FeatureInfo 생성.
         * total/completed는 "이 마일스톤에 배정된 이 피처의 태스크" 기준 (피처 전역 카운트 아님).
         * isPrimary(홈 여부)는 저장값이 아니라 "가장 이른 마일스톤" 규칙으로 파생해 넘겨받는다.
         */
        public static FeatureInfo of(MilestoneFeature link, int totalTasks, int completedTasks, boolean isPrimary) {
            Feature feature = link.getFeature();
            int pct = totalTasks == 0 ? 0 : (int) Math.round((double) completedTasks / totalTasks * 100);
            return FeatureInfo.builder()
                    .id(feature.getId())
                    .title(feature.getTitle())
                    .color(feature.getColor())
                    .totalTasks(totalTasks)
                    .completedTasks(completedTasks)
                    .progressPercentage(pct)
                    .isPrimary(isPrimary)
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
            // UtilizationStatus.determine(actual, capacity) — capacity = allocated, actual = actualWorkedHours
            String status = UtilizationStatus.determine(actualWorkedHours, allocated).name();

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
