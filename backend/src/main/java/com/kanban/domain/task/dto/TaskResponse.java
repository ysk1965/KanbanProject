package com.kanban.domain.task.dto;

import com.kanban.domain.tag.Tag;
import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public class TaskResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Simple {
        private String id;
        private String featureId;
        private String featureTitle;
        private String featureColor;
        private String blockId;
        private String blockName;
        private String title;
        private LocalDate startDate;
        private LocalDate dueDate;
        private LocalDate baselineStartDate;
        private LocalDate baselineDueDate;
        private Integer estimatedMinutes;
        private boolean completed;
        private Integer position;
        private List<TagInfo> tags;
        private int checklistTotal;
        private int checklistCompleted;
        private List<AssigneeInfo> assignees;

        public static Simple of(Task task, List<Tag> tags, int checklistTotal, int checklistCompleted, List<AssigneeInfo> assignees) {
            return Simple.builder()
                    .id(task.getId())
                    .featureId(task.getFeature().getId())
                    .featureTitle(task.getFeature().getTitle())
                    .featureColor(task.getFeature().getColor())
                    .blockId(task.getBlock().getId())
                    .blockName(task.getBlock().getName())
                    .title(task.getTitle())
                    .startDate(task.getStartDate())
                    .dueDate(task.getDueDate())
                    .baselineStartDate(task.getBaselineStartDate())
                    .baselineDueDate(task.getBaselineDueDate())
                    .estimatedMinutes(task.getEstimatedMinutes())
                    .completed(task.getIsCompleted())
                    .position(task.getPosition())
                    .tags(tags != null ? tags.stream().map(TagInfo::of).toList() : List.of())
                    .checklistTotal(checklistTotal)
                    .checklistCompleted(checklistCompleted)
                    .assignees(assignees != null ? assignees : List.of())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String featureId;
        private String featureTitle;
        private String featureColor;
        private String blockId;
        private String blockName;
        private String title;
        private String description;
        private LocalDate startDate;
        private LocalDate dueDate;
        private LocalDate baselineStartDate;
        private LocalDate baselineDueDate;
        private Integer estimatedMinutes;
        private boolean completed;
        private Integer position;
        private List<TagInfo> tags;
        private CreatorInfo createdBy;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private LocalDateTime completedAt;

        public static Detail of(Task task, List<Tag> tags) {
            return Detail.builder()
                    .id(task.getId())
                    .featureId(task.getFeature().getId())
                    .featureTitle(task.getFeature().getTitle())
                    .featureColor(task.getFeature().getColor())
                    .blockId(task.getBlock().getId())
                    .blockName(task.getBlock().getName())
                    .title(task.getTitle())
                    .description(task.getDescription())
                    .startDate(task.getStartDate())
                    .dueDate(task.getDueDate())
                    .baselineStartDate(task.getBaselineStartDate())
                    .baselineDueDate(task.getBaselineDueDate())
                    .estimatedMinutes(task.getEstimatedMinutes())
                    .completed(task.getIsCompleted())
                    .position(task.getPosition())
                    .tags(tags != null ? tags.stream().map(TagInfo::of).toList() : List.of())
                    .createdBy(CreatorInfo.of(task))
                    .createdAt(task.getCreatedAt())
                    .updatedAt(task.getUpdatedAt())
                    .completedAt(task.getCompletedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class CreatorInfo {
        private String id;
        private String name;

        public static CreatorInfo of(Task task) {
            return CreatorInfo.builder()
                    .id(task.getCreatedBy().getId())
                    .name(task.getCreatedBy().getName())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TagInfo {
        private String id;
        private String name;
        private String color;

        public static TagInfo of(Tag tag) {
            return TagInfo.builder()
                    .id(tag.getId())
                    .name(tag.getName())
                    .color(tag.getColor())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class AssigneeInfo {
        private String id;
        private String name;

        public static AssigneeInfo of(User user) {
            return AssigneeInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Simple> tasks;

        public static ListResponse of(List<Task> tasks,
                                      Map<String, List<Tag>> taskTagsMap,
                                      Map<String, int[]> checklistCountMap,
                                      Map<String, List<AssigneeInfo>> taskAssigneesMap) {
            return ListResponse.builder()
                    .tasks(tasks.stream()
                            .map(t -> {
                                int[] counts = checklistCountMap.getOrDefault(t.getId(), new int[]{0, 0});
                                return Simple.of(t,
                                        taskTagsMap.getOrDefault(t.getId(), List.of()),
                                        counts[0],
                                        counts[1],
                                        taskAssigneesMap.getOrDefault(t.getId(), List.of()));
                            })
                            .toList())
                    .build();
        }
    }
}
