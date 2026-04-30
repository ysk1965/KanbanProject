package com.kanban.domain.checklist.dto;

import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.jobrole.dto.JobRoleResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

public class ChecklistResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String title;
        private boolean completed;
        private AssigneeInfo assignee;
        private LocalDate startDate;
        private LocalDate dueDate;
        private LocalDate doneDate;
        private Integer position;
        private LocalDateTime createdAt;
        private LocalDateTime completedAt;

        public static Detail of(ChecklistItem item) {
            return Detail.builder()
                    .id(item.getId())
                    .title(item.getTitle())
                    .completed(item.getIsCompleted())
                    .assignee(item.getAssignee() != null ? AssigneeInfo.of(item) : null)
                    .startDate(item.getStartDate())
                    .dueDate(item.getDueDate())
                    .doneDate(item.getDoneDate())
                    .position(item.getPosition())
                    .createdAt(item.getCreatedAt())
                    .completedAt(item.getCompletedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class AssigneeInfo {
        private String id;
        private String name;
        private String profileImage;
        private JobRoleResponse.JobRoleInfo jobRole;

        public static AssigneeInfo of(ChecklistItem item) {
            return AssigneeInfo.builder()
                    .id(item.getAssignee().getId())
                    .name(item.getAssignee().getName())
                    .profileImage(item.getAssignee().getProfileImage())
                    .build();
        }

        /**
         * User 엔티티로부터 직접 생성 (by-assignee 뷰용)
         * Jackson SNAKE_CASE 전략에 의해 profileImage → profile_image, jobRole → job_role 직렬화됨
         */
        public static AssigneeInfo of(User user) {
            return AssigneeInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .profileImage(user.getProfileImage())
                    .build();
        }

        public static AssigneeInfo of(User user, JobRoleResponse.JobRoleInfo jobRole) {
            return AssigneeInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .profileImage(user.getProfileImage())
                    .jobRole(jobRole)
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private int total;
        private int completed;
        private List<Detail> items;

        public static ListResponse of(List<ChecklistItem> items) {
            int total = items.size();
            int completed = (int) items.stream().filter(ChecklistItem::getIsCompleted).count();

            return ListResponse.builder()
                    .total(total)
                    .completed(completed)
                    .items(items.stream().map(Detail::of).toList())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardItem {
        private String id;
        private String title;
        private boolean completed;
        private AssigneeInfo assignee;
        private LocalDate startDate;
        private LocalDate dueDate;
        private TaskInfo task;
        private FeatureInfo feature;

        public static BoardItem of(ChecklistItem item) {
            Task task = item.getTask();
            Feature feature = task != null ? task.getFeature() : null;

            return BoardItem.builder()
                    .id(item.getId())
                    .title(item.getTitle())
                    .completed(item.getIsCompleted())
                    .assignee(item.getAssignee() != null ? AssigneeInfo.of(item) : null)
                    .startDate(item.getStartDate())
                    .dueDate(item.getDueDate())
                    .task(task != null ? TaskInfo.of(task) : null)
                    .feature(feature != null ? FeatureInfo.of(feature) : null)
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TaskInfo {
        private String id;
        private String title;

        public static TaskInfo of(Task task) {
            return TaskInfo.builder()
                    .id(task.getId())
                    .title(task.getTitle())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class FeatureInfo {
        private String id;
        private String title;
        private String color;

        public static FeatureInfo of(Feature feature) {
            return FeatureInfo.builder()
                    .id(feature.getId())
                    .title(feature.getTitle())
                    .color(feature.getColor())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardListResponse {
        private int total;
        private List<BoardItem> items;

        public static BoardListResponse of(List<ChecklistItem> items) {
            return BoardListResponse.builder()
                    .total(items.size())
                    .items(items.stream().map(BoardItem::of).toList())
                    .build();
        }
    }

    // ==================== by-assignee Response (캘린더/리소스 뷰용) ====================

    /**
     * UC-001: GET /boards/{boardId}/checklist-items/by-assignee 응답 최상위 DTO
     * - assignees: 담당자별 그룹 목록
     * - unassigned: 담당자 미배정 항목 목록
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class ByAssigneeResponse {
        private List<AssigneeGroup> assignees;
        private List<AssigneeItemResponse> unassigned;

        public static ByAssigneeResponse of(List<ChecklistItem> items) {
            return of(items, Map.of());
        }

        /**
         * @param jobRoleByUserId userId → 해당 유저의 보드 멤버 직군 정보 (없으면 빈 맵)
         */
        public static ByAssigneeResponse of(List<ChecklistItem> items,
                                             Map<String, JobRoleResponse.JobRoleInfo> jobRoleByUserId) {
            // 담당자 있는 항목과 없는 항목 분리
            List<ChecklistItem> assignedItems = items.stream()
                    .filter(c -> c.getAssignee() != null)
                    .toList();
            List<ChecklistItem> unassignedItems = items.stream()
                    .filter(c -> c.getAssignee() == null)
                    .toList();

            // 담당자별 그룹핑 (LinkedHashMap으로 삽입 순서 유지)
            Map<String, List<ChecklistItem>> grouped = assignedItems.stream()
                    .collect(Collectors.groupingBy(
                            c -> c.getAssignee().getId(),
                            LinkedHashMap::new,
                            Collectors.toList()
                    ));

            List<AssigneeGroup> assigneeGroups = grouped.entrySet().stream()
                    .map(entry -> {
                        User assignee = entry.getValue().get(0).getAssignee();
                        JobRoleResponse.JobRoleInfo jobRole = jobRoleByUserId.get(assignee.getId());
                        List<AssigneeItemResponse> groupItems = entry.getValue().stream()
                                .map(AssigneeItemResponse::of)
                                .toList();
                        return AssigneeGroup.builder()
                                .assignee(AssigneeInfo.of(assignee, jobRole))
                                .items(groupItems)
                                .build();
                    })
                    .toList();

            return ByAssigneeResponse.builder()
                    .assignees(assigneeGroups)
                    .unassigned(unassignedItems.stream().map(AssigneeItemResponse::of).toList())
                    .build();
        }
    }

    /**
     * 담당자 + 해당 담당자의 ChecklistItem 목록
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class AssigneeGroup {
        private AssigneeInfo assignee;
        private List<AssigneeItemResponse> items;
    }

    /**
     * 개별 ChecklistItem 응답 (캘린더/리소스 뷰용)
     * - task: 상위 Task 요약 (id, title)
     * - feature: 상위 Feature 요약 (id, title, color)
     * Jackson SNAKE_CASE 전략에 의해 startDate → start_date, dueDate → due_date 직렬화됨
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class AssigneeItemResponse {
        private String id;
        private String title;
        private boolean completed;
        private LocalDate startDate;
        private LocalDate dueDate;
        private TaskInfo task;
        private FeatureInfo feature;

        public static AssigneeItemResponse of(ChecklistItem item) {
            Task task = item.getTask();
            Feature feature = task != null ? task.getFeature() : null;

            return AssigneeItemResponse.builder()
                    .id(item.getId())
                    .title(item.getTitle())
                    .completed(item.getIsCompleted())
                    .startDate(item.getStartDate())
                    .dueDate(item.getDueDate())
                    .task(task != null ? TaskInfo.of(task) : null)
                    .feature(feature != null ? FeatureInfo.of(feature) : null)
                    .build();
        }
    }
}
