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
     * <p>진행률·KPI(total/completed/overdue/unassigned items)는 체크리스트 항목 기준, 태스크 카운트는 참고용.</p>
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
        private int totalTasks;
        private int completedTasks;
        private int totalItems;
        private int completedItems;
        private int overdueItems;
        private int unassignedItems;
        private Boolean isDefault;
        private List<FeatureInfo> features;
        private CreatorInfo createdBy;
        private LocalDateTime createdAt;

        /**
         * @param progressPercentage 체크리스트 기준 진행률 (completedItems / totalItems)
         * @param taskCounts   featureId → [total, completed] (태스크 단위, 이 마일스톤 스코프)
         * @param itemCounts   featureId → [total, completed, overdue, unassigned] (체크리스트 단위, 이 마일스톤 스코프)
         */
        public static DetailSimple of(Milestone milestone, List<MilestoneFeature> links, int progressPercentage,
                                      Map<String, int[]> taskCounts, Map<String, int[]> itemCounts,
                                      Map<String, String> homeByFeature) {
            List<FeatureInfo> featureInfos = buildFeatureInfos(milestone, links, taskCounts, itemCounts, homeByFeature);
            Totals totals = Totals.of(taskCounts, itemCounts);

            return DetailSimple.builder()
                    .id(milestone.getId())
                    .title(milestone.getTitle())
                    .description(milestone.getDescription())
                    .startDate(milestone.getStartDate())
                    .endDate(milestone.getEndDate())
                    .featureCount(links.size())
                    .progressPercentage(progressPercentage)
                    .totalTasks(totals.totalTasks)
                    .completedTasks(totals.completedTasks)
                    .totalItems(totals.totalItems)
                    .completedItems(totals.completedItems)
                    .overdueItems(totals.overdueItems)
                    .unassignedItems(totals.unassignedItems)
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
        private int totalTasks;
        private int completedTasks;
        private int totalItems;
        private int completedItems;
        private int overdueItems;
        private int unassignedItems;
        private Boolean isDefault;
        private List<FeatureInfo> features;
        private CreatorInfo createdBy;
        private LocalDateTime createdAt;

        /**
         * @param progressPercentage 체크리스트 기준 진행률 (completedItems / totalItems)
         * @param taskCounts   featureId → [total, completed] (태스크 단위, 이 마일스톤 스코프)
         * @param itemCounts   featureId → [total, completed, overdue, unassigned] (체크리스트 단위, 이 마일스톤 스코프)
         */
        public static Detail of(Milestone milestone, List<MilestoneFeature> links, int progressPercentage,
                                Map<String, int[]> taskCounts, Map<String, int[]> itemCounts,
                                Map<String, String> homeByFeature) {
            List<FeatureInfo> featureInfos = buildFeatureInfos(milestone, links, taskCounts, itemCounts, homeByFeature);
            Totals totals = Totals.of(taskCounts, itemCounts);

            return Detail.builder()
                    .id(milestone.getId())
                    .title(milestone.getTitle())
                    .description(milestone.getDescription())
                    .startDate(milestone.getStartDate())
                    .endDate(milestone.getEndDate())
                    .featureCount(links.size())
                    .progressPercentage(progressPercentage)
                    .totalTasks(totals.totalTasks)
                    .completedTasks(totals.completedTasks)
                    .totalItems(totals.totalItems)
                    .completedItems(totals.completedItems)
                    .overdueItems(totals.overdueItems)
                    .unassignedItems(totals.unassignedItems)
                    .isDefault(milestone.getIsDefault())
                    .features(featureInfos)
                    .createdBy(CreatorInfo.of(milestone.getCreatedBy()))
                    .createdAt(milestone.getCreatedAt())
                    .build();
        }
    }

    /** 링크별 FeatureInfo 구성 — 태스크/체크리스트 카운트는 이 마일스톤 스코프, 홈 여부는 파생값 */
    private static List<FeatureInfo> buildFeatureInfos(Milestone milestone, List<MilestoneFeature> links,
                                                       Map<String, int[]> taskCounts, Map<String, int[]> itemCounts,
                                                       Map<String, String> homeByFeature) {
        return links.stream()
                .map(link -> {
                    String featureId = link.getFeature().getId();
                    int[] t = taskCounts.getOrDefault(featureId, EMPTY_TASK_COUNTS);
                    int[] c = itemCounts.getOrDefault(featureId, EMPTY_ITEM_COUNTS);
                    boolean isHome = milestone.getId().equals(homeByFeature.get(featureId));
                    return FeatureInfo.of(link, t[0], t[1], c[0], c[1], c[2], c[3], isHome);
                })
                .toList();
    }

    private static final int[] EMPTY_TASK_COUNTS = new int[]{0, 0};
    private static final int[] EMPTY_ITEM_COUNTS = new int[]{0, 0, 0, 0};

    /**
     * 마일스톤 단위 합계 — (마일스톤, 피처) 행 전부를 합산한다.
     * 피처 없는 태스크(featureId null 키) 행도 포함.
     */
    private record Totals(int totalTasks, int completedTasks,
                          int totalItems, int completedItems, int overdueItems, int unassignedItems) {
        static Totals of(Map<String, int[]> taskCounts, Map<String, int[]> itemCounts) {
            int totalTasks = 0, completedTasks = 0;
            for (int[] t : taskCounts.values()) {
                totalTasks += t[0];
                completedTasks += t[1];
            }
            int totalItems = 0, completedItems = 0, overdueItems = 0, unassignedItems = 0;
            for (int[] c : itemCounts.values()) {
                totalItems += c[0];
                completedItems += c[1];
                overdueItems += c[2];
                unassignedItems += c[3];
            }
            return new Totals(totalTasks, completedTasks, totalItems, completedItems, overdueItems, unassignedItems);
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
                                      Map<String, Map<String, int[]>> taskCountsMap,
                                      Map<String, Map<String, int[]>> itemCountsMap,
                                      Map<String, String> homeByFeature) {
            List<DetailSimple> detailList = milestones.stream()
                    .map(m -> DetailSimple.of(
                            m,
                            linksMap.getOrDefault(m.getId(), List.of()),
                            progressMap.getOrDefault(m.getId(), 0),
                            taskCountsMap.getOrDefault(m.getId(), Map.of()),
                            itemCountsMap.getOrDefault(m.getId(), Map.of()),
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
        private int totalItems;
        private int completedItems;
        private int overdueItems;
        private int unassignedItems;
        private int progressPercentage;
        private boolean isPrimary;

        /**
         * 마일스톤-스코프 카운트로 FeatureInfo 생성.
         * 모든 카운트는 "이 마일스톤에 배정된 이 피처의 태스크(와 그 체크리스트)" 기준 (피처 전역 카운트 아님).
         * progressPercentage는 체크리스트 항목 기준(completedItems / totalItems, 항목 없으면 0).
         * isPrimary(홈 여부)는 저장값이 아니라 "가장 이른 마일스톤" 규칙으로 파생해 넘겨받는다.
         */
        public static FeatureInfo of(MilestoneFeature link,
                                     int totalTasks, int completedTasks,
                                     int totalItems, int completedItems, int overdueItems, int unassignedItems,
                                     boolean isPrimary) {
            Feature feature = link.getFeature();
            int pct = totalItems == 0 ? 0 : (int) Math.round((double) completedItems / totalItems * 100);
            return FeatureInfo.builder()
                    .id(feature.getId())
                    .title(feature.getTitle())
                    .color(feature.getColor())
                    .totalTasks(totalTasks)
                    .completedTasks(completedTasks)
                    .totalItems(totalItems)
                    .completedItems(completedItems)
                    .overdueItems(overdueItems)
                    .unassignedItems(unassignedItems)
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
