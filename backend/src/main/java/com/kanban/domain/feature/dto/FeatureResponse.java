package com.kanban.domain.feature.dto;

import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureStatus;
import com.kanban.domain.feature.Priority;
import com.kanban.domain.tag.Tag;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class FeatureResponse {

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Simple implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;
        private String id;
        private String title;
        private String color;
        private AssigneeInfo assignee;
        private Priority priority;
        private LocalDate dueDate;
        private FeatureStatus status;
        private int totalTasks;
        private int completedTasks;
        private int progressPercentage;
        private Integer position;
        private List<TagInfo> tags;

        public static Simple of(Feature feature, List<Tag> tags) {
            return Simple.builder()
                    .id(feature.getId())
                    .title(feature.getTitle())
                    .color(feature.getColor())
                    .assignee(feature.getAssignee() != null ? AssigneeInfo.of(feature) : null)
                    .priority(feature.getPriority())
                    .dueDate(feature.getDueDate())
                    .status(feature.getStatus())
                    .totalTasks(feature.getTotalTasks())
                    .completedTasks(feature.getCompletedTasks())
                    .progressPercentage(feature.getProgressPercentage())
                    .position(feature.getPosition())
                    .tags(tags != null ? tags.stream().map(TagInfo::of).toList() : List.of())
                    .build();
        }
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Detail implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;
        private String id;
        private String title;
        private String description;
        private String color;
        private AssigneeInfo assignee;
        private Priority priority;
        private LocalDate dueDate;
        private FeatureStatus status;
        private int totalTasks;
        private int completedTasks;
        private int progressPercentage;
        private Integer position;
        private List<TagInfo> tags;
        private CreatorInfo createdBy;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private LocalDateTime completedAt;

        public static Detail of(Feature feature, List<Tag> tags) {
            return Detail.builder()
                    .id(feature.getId())
                    .title(feature.getTitle())
                    .description(feature.getDescription())
                    .color(feature.getColor())
                    .assignee(feature.getAssignee() != null ? AssigneeInfo.of(feature) : null)
                    .priority(feature.getPriority())
                    .dueDate(feature.getDueDate())
                    .status(feature.getStatus())
                    .totalTasks(feature.getTotalTasks())
                    .completedTasks(feature.getCompletedTasks())
                    .progressPercentage(feature.getProgressPercentage())
                    .position(feature.getPosition())
                    .tags(tags != null ? tags.stream().map(TagInfo::of).toList() : List.of())
                    .createdBy(CreatorInfo.of(feature))
                    .createdAt(feature.getCreatedAt())
                    .updatedAt(feature.getUpdatedAt())
                    .completedAt(feature.getCompletedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AssigneeInfo implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;
        private String id;
        private String name;
        private String email;
        private String profileImage;

        public static AssigneeInfo of(Feature feature) {
            return AssigneeInfo.builder()
                    .id(feature.getAssignee().getId())
                    .name(feature.getAssignee().getName())
                    .email(feature.getAssignee().getEmail())
                    .profileImage(feature.getAssignee().getProfileImage())
                    .build();
        }
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreatorInfo implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;
        private String id;
        private String name;

        public static CreatorInfo of(Feature feature) {
            return CreatorInfo.builder()
                    .id(feature.getCreatedBy().getId())
                    .name(feature.getCreatedBy().getName())
                    .build();
        }
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TagInfo implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;
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
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ListResponse implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;

        private List<Simple> features;

        public static ListResponse of(List<Feature> features, java.util.Map<String, List<Tag>> featureTagsMap) {
            return ListResponse.builder()
                    .features(features.stream()
                            .map(f -> Simple.of(f, featureTagsMap.getOrDefault(f.getId(), List.of())))
                            .toList())
                    .build();
        }
    }
}
