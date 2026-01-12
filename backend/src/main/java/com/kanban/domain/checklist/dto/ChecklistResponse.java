package com.kanban.domain.checklist.dto;

import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.task.Task;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

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

        public static AssigneeInfo of(ChecklistItem item) {
            return AssigneeInfo.builder()
                    .id(item.getAssignee().getId())
                    .name(item.getAssignee().getName())
                    .profileImage(item.getAssignee().getProfileImage())
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
}
