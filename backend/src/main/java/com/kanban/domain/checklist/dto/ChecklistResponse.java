package com.kanban.domain.checklist.dto;

import com.kanban.domain.block.Block;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.contractor.dto.BoardContractorResponse;
import com.kanban.domain.contractor.entity.BoardContractor;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.jobrole.dto.JobRoleResponse;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
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
        private BoardContractorResponse.ContractorInfo contractor;
        private LocalDate startDate;
        private LocalDate dueDate;
        private LocalDate doneDate;
        private Integer position;
        private LocalDateTime createdAt;
        private LocalDateTime completedAt;
        /**
         * 이 항목에 달린 댓글 수 — 행의 💬 뱃지에 쓴다.
         *
         * <p>목록 조회에서만 채운다. 단건 응답(생성·수정·토글)에서는 null이며,
         * 클라이언트는 null을 "값 없음"으로 보고 기존 카운트를 유지해야 한다.
         * 토글 한 번마다 카운트 쿼리를 더 돌릴 이유가 없다.</p>
         */
        private Integer commentCount;

        public static Detail of(ChecklistItem item) {
            return of(item, null);
        }

        public static Detail of(ChecklistItem item, Integer commentCount) {
            return Detail.builder()
                    .id(item.getId())
                    .title(item.getTitle())
                    .completed(item.getIsCompleted())
                    .assignee(item.getAssignee() != null ? AssigneeInfo.of(item) : null)
                    .contractor(BoardContractorResponse.ContractorInfo.of(item.getContractor()))
                    .startDate(item.getStartDate())
                    .dueDate(item.getDueDate())
                    .doneDate(item.getDoneDate())
                    .position(item.getPosition())
                    .createdAt(item.getCreatedAt())
                    .completedAt(item.getCompletedAt())
                    .commentCount(commentCount)
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
            return of(items, Map.of());
        }

        /**
         * @param commentCounts 항목 id → 댓글 수. 항목마다 세면 N+1이므로 한 번의 group by 결과를 넘긴다.
         *                      목록에 없는 항목은 0으로 채운다("아직 대화 없음"이 확정된 값이다).
         */
        public static ListResponse of(List<ChecklistItem> items, Map<String, Integer> commentCounts) {
            int total = items.size();
            int completed = (int) items.stream().filter(ChecklistItem::getIsCompleted).count();

            return ListResponse.builder()
                    .total(total)
                    .completed(completed)
                    .items(items.stream()
                            .map(i -> Detail.of(i, commentCounts.getOrDefault(i.getId(), 0)))
                            .toList())
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
        private BoardContractorResponse.ContractorInfo contractor;
        private LocalDate startDate;
        private LocalDate dueDate;
        private LocalDate doneDate;
        private LocalDateTime completedAt;
        /** 배치 레일에서 "오늘 생성됨" 판정에 쓴다 — UTC 저장, 로컬 변환은 클라이언트 몫 */
        private LocalDateTime createdAt;
        private TaskInfo task;
        private FeatureInfo feature;
        private BlockInfo block;
        private MilestoneInfo milestone;

        public static BoardItem of(ChecklistItem item) {
            Task task = item.getTask();
            Feature feature = task != null ? task.getFeature() : null;
            Block block = task != null ? task.getBlock() : null;
            Milestone milestone = task != null ? task.getMilestone() : null;

            return BoardItem.builder()
                    .id(item.getId())
                    .title(item.getTitle())
                    .completed(item.getIsCompleted())
                    .assignee(item.getAssignee() != null ? AssigneeInfo.of(item) : null)
                    .contractor(BoardContractorResponse.ContractorInfo.of(item.getContractor()))
                    .startDate(item.getStartDate())
                    .dueDate(item.getDueDate())
                    .doneDate(item.getDoneDate())
                    .completedAt(item.getCompletedAt())
                    .createdAt(item.getCreatedAt())
                    .task(task != null ? TaskInfo.of(task) : null)
                    .feature(feature != null ? FeatureInfo.of(feature) : null)
                    .block(BlockInfo.of(block))
                    .milestone(MilestoneInfo.of(milestone))
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
    public static class BlockInfo {
        private String id;
        private String name;
        private String color;
        private Integer position;

        public static BlockInfo of(Block block) {
            if (block == null) {
                return null;
            }
            return BlockInfo.builder()
                    .id(block.getId())
                    .name(block.getName())
                    .color(block.getColor())
                    .position(block.getPosition())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MilestoneInfo {
        private String id;
        private String title;

        public static MilestoneInfo of(Milestone milestone) {
            if (milestone == null) {
                return null;
            }
            return MilestoneInfo.builder()
                    .id(milestone.getId())
                    .title(milestone.getTitle())
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
     * - assignees: 담당자(User)별 그룹 목록
     * - contractors: 외주(BoardContractor)별 그룹 목록
     * - unassigned: 담당자 미배정 항목 목록
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class ByAssigneeResponse {
        private List<AssigneeGroup> assignees;
        private List<ContractorGroup> contractors;
        private List<AssigneeItemResponse> unassigned;

        public static ByAssigneeResponse of(List<ChecklistItem> items) {
            return of(items, Map.of());
        }

        /**
         * @param jobRoleByUserId userId → 해당 유저의 보드 멤버 직군 정보 (없으면 빈 맵)
         */
        public static ByAssigneeResponse of(List<ChecklistItem> items,
                                             Map<String, JobRoleResponse.JobRoleInfo> jobRoleByUserId) {
            // 담당자(User), 외주(Contractor), 미배정으로 분리
            List<ChecklistItem> assignedItems = new ArrayList<>();
            List<ChecklistItem> contractorItems = new ArrayList<>();
            List<ChecklistItem> unassignedItems = new ArrayList<>();
            for (ChecklistItem c : items) {
                if (c.getAssignee() != null) assignedItems.add(c);
                else if (c.getContractor() != null) contractorItems.add(c);
                else unassignedItems.add(c);
            }

            // 담당자(User)별 그룹핑
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

            // 외주(Contractor)별 그룹핑
            Map<String, List<ChecklistItem>> groupedContractors = contractorItems.stream()
                    .collect(Collectors.groupingBy(
                            c -> c.getContractor().getId(),
                            LinkedHashMap::new,
                            Collectors.toList()
                    ));

            List<ContractorGroup> contractorGroups = groupedContractors.entrySet().stream()
                    .map(entry -> {
                        BoardContractor contractor = entry.getValue().get(0).getContractor();
                        List<AssigneeItemResponse> groupItems = entry.getValue().stream()
                                .map(AssigneeItemResponse::of)
                                .toList();
                        return ContractorGroup.builder()
                                .contractor(BoardContractorResponse.ContractorInfo.of(contractor))
                                .items(groupItems)
                                .build();
                    })
                    .toList();

            return ByAssigneeResponse.builder()
                    .assignees(assigneeGroups)
                    .contractors(contractorGroups)
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
     * 외주 + 해당 외주의 ChecklistItem 목록 (워크로드 뷰의 별도 행)
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class ContractorGroup {
        private BoardContractorResponse.ContractorInfo contractor;
        private List<AssigneeItemResponse> items;
    }

    /**
     * 개별 ChecklistItem 응답 (캘린더/리소스 뷰용)
     * - task: 상위 Task 요약 (id, title)
     * - feature: 상위 Feature 요약 (id, title, color)
     * - milestone: 상위 Task 의 마일스톤 요약 (id, title) — 태스크 단위 마일스톤 배정 반영
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
        private BlockInfo block;
        private MilestoneInfo milestone;

        public static AssigneeItemResponse of(ChecklistItem item) {
            Task task = item.getTask();
            Feature feature = task != null ? task.getFeature() : null;
            Block block = task != null ? task.getBlock() : null;
            Milestone milestone = task != null ? task.getMilestone() : null;

            return AssigneeItemResponse.builder()
                    .id(item.getId())
                    .title(item.getTitle())
                    .completed(item.getIsCompleted())
                    .startDate(item.getStartDate())
                    .dueDate(item.getDueDate())
                    .task(task != null ? TaskInfo.of(task) : null)
                    .feature(feature != null ? FeatureInfo.of(feature) : null)
                    .block(BlockInfo.of(block))
                    .milestone(MilestoneInfo.of(milestone))
                    .build();
        }
    }
}
