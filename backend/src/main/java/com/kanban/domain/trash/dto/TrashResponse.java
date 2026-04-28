package com.kanban.domain.trash.dto;

import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.task.Task;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class TrashResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<FeatureItem> features;
        private List<TaskItem> tasks;
        private List<ChecklistItemItem> checklistItems;
        private int retentionDays;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class FeatureItem {
        private String id;
        private String title;
        private String description;
        private Integer totalTasks;
        private Integer completedTasks;
        private LocalDateTime deletedAt;
        private String deletedBy;

        public static FeatureItem of(Feature f) {
            return FeatureItem.builder()
                    .id(f.getId())
                    .title(f.getTitle())
                    .description(f.getDescription())
                    .totalTasks(f.getTotalTasks())
                    .completedTasks(f.getCompletedTasks())
                    .deletedAt(f.getDeletedAt())
                    .deletedBy(f.getDeletedBy())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TaskItem {
        private String id;
        private String title;
        private String featureId;
        private String featureTitle;
        private LocalDateTime deletedAt;
        private String deletedBy;
        private boolean partOfDeletedFeature;

        public static TaskItem of(Task t) {
            Feature f = t.getFeature();
            // feature가 soft-deleted인 경우 @SQLRestriction 때문에 t.getFeature()는 null 또는 LazyInit 예외 가능
            // 안전하게 ID만 노출하고 title은 null
            String fid = null;
            String ftitle = null;
            boolean partOf = false;
            try {
                if (f != null) {
                    fid = f.getId();
                    ftitle = f.getTitle();
                    partOf = f.isDeleted();
                }
            } catch (Exception ignore) {
                partOf = true;
            }
            return TaskItem.builder()
                    .id(t.getId())
                    .title(t.getTitle())
                    .featureId(fid)
                    .featureTitle(ftitle)
                    .deletedAt(t.getDeletedAt())
                    .deletedBy(t.getDeletedBy())
                    .partOfDeletedFeature(partOf)
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ChecklistItemItem {
        private String id;
        private String title;
        private String taskId;
        private String taskTitle;
        private LocalDateTime deletedAt;
        private String deletedBy;
        private boolean partOfDeletedParent;

        public static ChecklistItemItem of(ChecklistItem ci) {
            Task t = ci.getTask();
            String tid = null;
            String ttitle = null;
            boolean partOf = false;
            try {
                if (t != null) {
                    tid = t.getId();
                    ttitle = t.getTitle();
                    partOf = t.isDeleted();
                }
            } catch (Exception ignore) {
                partOf = true;
            }
            return ChecklistItemItem.builder()
                    .id(ci.getId())
                    .title(ci.getTitle())
                    .taskId(tid)
                    .taskTitle(ttitle)
                    .deletedAt(ci.getDeletedAt())
                    .deletedBy(ci.getDeletedBy())
                    .partOfDeletedParent(partOf)
                    .build();
        }
    }
}
