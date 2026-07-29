package com.kanban.domain.dailychecklist.dto;

import com.kanban.domain.block.Block;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.dailychecklist.DailyChecklist;
import com.kanban.domain.dailychecklist.DailySource;
import com.kanban.domain.dailychecklist.service.DailyChecklistResolver;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import com.kanban.domain.checklist.dto.ChecklistResponse;
import com.kanban.domain.meeting.dto.MeetingResponse;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class DailyChecklistResponse {

    /**
     * 타임블록 모달용 통합 응답
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class TimeblockDataResponse {
        private List<ItemResponse> dailyChecklistItems;
        private List<ChecklistResponse.BoardItem> boardChecklistItems;
        private List<MeetingResponse.Summary> meetings;
    }

    /**
     * 데일리 체크리스트 목록 응답 (날짜별)
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private LocalDate date;
        private List<ColumnResponse> columns;
    }

    /**
     * 컬럼 (담당자별) 응답
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class ColumnResponse {
        private UserInfo user;
        private List<ItemResponse> items;
    }

    /**
     * 데일리 체크리스트 아이템 응답
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class ItemResponse {
        private String id;
        private String checklistItemId;
        private String title;
        private UserInfo assignee;
        private LocalDate assignedDate;
        private Integer position;
        private Boolean completed;
        private TaskInfo task;
        private FeatureInfo feature;
        private ChecklistResponse.BlockInfo block;
        private ChecklistResponse.MilestoneInfo milestone;
        private LocalDate startDate;
        private LocalDate dueDate;
        private LocalDateTime createdAt;

        /** 이 항목이 오늘 목록에 있는 이유 (DERIVED / OVERDUE / PINNED / ADHOC) */
        private DailySource source;

        /** 사용자가 명시적으로 이 날짜로 당겨온 항목인지 (daily_checklists 행 존재) */
        private Boolean pinned;

        /**
         * 파생 + 예외를 병합한 결과를 응답으로 변환한다.
         *
         * @see DailyChecklistResolver
         */
        public static ItemResponse of(DailyChecklistResolver.ResolvedItem resolved) {
            ChecklistItem checklistItem = resolved.item();
            Task task = checklistItem != null ? checklistItem.getTask() : null;
            Feature feature = task != null ? task.getFeature() : null;
            Block block = task != null ? task.getBlock() : null;
            Milestone milestone = task != null ? task.getMilestone() : null;

            return ItemResponse.builder()
                    .id(resolved.id())
                    .checklistItemId(resolved.checklistItemId())
                    .title(resolved.title())
                    .assignee(UserInfo.of(resolved.assignee()))
                    .assignedDate(resolved.assignedDate())
                    .position(resolved.position())
                    .completed(resolved.completed())
                    .task(task != null ? TaskInfo.of(task) : null)
                    .feature(feature != null ? FeatureInfo.of(feature) : null)
                    .block(ChecklistResponse.BlockInfo.of(block))
                    .milestone(ChecklistResponse.MilestoneInfo.of(milestone))
                    .startDate(resolved.startDate())
                    .dueDate(resolved.dueDate())
                    .createdAt(resolved.row() != null ? resolved.row().getCreatedAt() : null)
                    .source(resolved.source())
                    .pinned(resolved.pinned())
                    .build();
        }

        public static ItemResponse of(DailyChecklist dailyChecklist) {
            ChecklistItem checklistItem = dailyChecklist.getChecklistItem();
            Task task = checklistItem != null ? checklistItem.getTask() : null;
            Feature feature = task != null ? task.getFeature() : null;
            Block block = task != null ? task.getBlock() : null;
            Milestone milestone = task != null ? task.getMilestone() : null;

            return ItemResponse.builder()
                    .id(dailyChecklist.getId())
                    .checklistItemId(checklistItem != null ? checklistItem.getId() : null)
                    .title(dailyChecklist.getTitle())
                    .assignee(UserInfo.of(dailyChecklist.getAssignee()))
                    .assignedDate(dailyChecklist.getAssignedDate())
                    .position(dailyChecklist.getPosition())
                    .completed(checklistItem != null ? checklistItem.getIsCompleted() : false)
                    .task(task != null ? TaskInfo.of(task) : null)
                    .feature(feature != null ? FeatureInfo.of(feature) : null)
                    .block(ChecklistResponse.BlockInfo.of(block))
                    .milestone(ChecklistResponse.MilestoneInfo.of(milestone))
                    .startDate(checklistItem != null ? checklistItem.getStartDate() : null)
                    .dueDate(checklistItem != null ? checklistItem.getDueDate() : null)
                    .createdAt(dailyChecklist.getCreatedAt())
                    .source(checklistItem != null ? DailySource.PINNED : DailySource.ADHOC)
                    .pinned(true)
                    .build();
        }
    }

    /**
     * 사용자 정보
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class UserInfo {
        private String id;
        private String name;
        private String profileImage;

        public static UserInfo of(User user) {
            return UserInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .profileImage(user.getProfileImage())
                    .build();
        }
    }

    /**
     * Task 정보
     */
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

    /**
     * Feature 정보
     */
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
}
