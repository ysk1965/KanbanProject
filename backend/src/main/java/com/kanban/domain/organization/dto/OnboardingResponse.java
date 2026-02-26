package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class OnboardingResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TemplateSummary {
        private String id;
        private String name;
        private String description;
        private boolean autoAssign;
        private DepartmentInfo targetDepartment;
        private JobGroupInfo targetJobGroup;
        private boolean isActive;
        private int itemCount;
        private int displayOrder;

        public static TemplateSummary of(OrgOnboardingTemplate t) {
            return TemplateSummary.builder()
                    .id(t.getId())
                    .name(t.getName())
                    .description(t.getDescription())
                    .autoAssign(t.isAutoAssign())
                    .targetDepartment(t.getTargetDepartment() != null ?
                            new DepartmentInfo(t.getTargetDepartment().getId(), t.getTargetDepartment().getName()) : null)
                    .targetJobGroup(t.getTargetJobGroup() != null ?
                            new JobGroupInfo(t.getTargetJobGroup().getId(), t.getTargetJobGroup().getName()) : null)
                    .isActive(t.isActive())
                    .itemCount(t.getItems().size())
                    .displayOrder(t.getDisplayOrder())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TemplateDetail {
        private String id;
        private String name;
        private String description;
        private boolean autoAssign;
        private DepartmentInfo targetDepartment;
        private JobGroupInfo targetJobGroup;
        private boolean isActive;
        private int displayOrder;
        private List<TemplateItemDetail> items;

        public static TemplateDetail of(OrgOnboardingTemplate t) {
            return TemplateDetail.builder()
                    .id(t.getId())
                    .name(t.getName())
                    .description(t.getDescription())
                    .autoAssign(t.isAutoAssign())
                    .targetDepartment(t.getTargetDepartment() != null ?
                            new DepartmentInfo(t.getTargetDepartment().getId(), t.getTargetDepartment().getName()) : null)
                    .targetJobGroup(t.getTargetJobGroup() != null ?
                            new JobGroupInfo(t.getTargetJobGroup().getId(), t.getTargetJobGroup().getName()) : null)
                    .isActive(t.isActive())
                    .displayOrder(t.getDisplayOrder())
                    .items(t.getItems().stream().map(TemplateItemDetail::of).toList())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TemplateItemDetail {
        private String id;
        private String title;
        private String description;
        private Integer dueDayOffset;
        private String assigneeRole;
        private int displayOrder;

        public static TemplateItemDetail of(OrgOnboardingTemplateItem item) {
            return TemplateItemDetail.builder()
                    .id(item.getId())
                    .title(item.getTitle())
                    .description(item.getDescription())
                    .dueDayOffset(item.getDueDayOffset())
                    .assigneeRole(item.getAssigneeRole() != null ? item.getAssigneeRole().name() : null)
                    .displayOrder(item.getDisplayOrder())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class InstanceSummary {
        private String id;
        private String memberId;
        private String memberName;
        private String memberProfileImageUrl;
        private String templateName;
        private int totalItems;
        private int completedItems;
        private int progressPercent;
        private String status;
        private LocalDateTime startedAt;
        private NextItem nextItem;

        public static InstanceSummary of(OrgOnboardingInstance inst) {
            return InstanceSummary.builder()
                    .id(inst.getId())
                    .memberId(inst.getMember().getId())
                    .memberName(inst.getMember().getUser().getName())
                    .memberProfileImageUrl(inst.getMember().getUser().getProfileImage())
                    .templateName(inst.getTemplateName())
                    .totalItems(inst.getTotalItems())
                    .completedItems(inst.getCompletedItems())
                    .progressPercent(inst.getProgressPercent())
                    .status(inst.getStatus().name())
                    .startedAt(inst.getStartedAt())
                    .build();
        }

        public static InstanceSummary of(OrgOnboardingInstance inst, NextItem nextItem) {
            InstanceSummary summary = of(inst);
            return InstanceSummary.builder()
                    .id(summary.id)
                    .memberId(summary.memberId)
                    .memberName(summary.memberName)
                    .memberProfileImageUrl(summary.memberProfileImageUrl)
                    .templateName(summary.templateName)
                    .totalItems(summary.totalItems)
                    .completedItems(summary.completedItems)
                    .progressPercent(summary.progressPercent)
                    .status(summary.status)
                    .startedAt(summary.startedAt)
                    .nextItem(nextItem)
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class NextItem {
        private String title;
        private LocalDate dueDate;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class InstanceItemDetail {
        private String id;
        private String title;
        private String description;
        private LocalDate dueDate;
        private String assigneeId;
        private String assigneeName;
        private boolean isCompleted;
        private LocalDateTime completedAt;
        private String completedByName;
        private int displayOrder;

        public static InstanceItemDetail of(OrgOnboardingInstanceItem item) {
            return InstanceItemDetail.builder()
                    .id(item.getId())
                    .title(item.getTitle())
                    .description(item.getDescription())
                    .dueDate(item.getDueDate())
                    .assigneeId(item.getAssignee() != null ? item.getAssignee().getId() : null)
                    .assigneeName(item.getAssignee() != null ? item.getAssignee().getUser().getName() : null)
                    .isCompleted(item.isCompleted())
                    .completedAt(item.getCompletedAt())
                    .completedByName(item.getCompletedBy() != null ? item.getCompletedBy().getName() : null)
                    .displayOrder(item.getDisplayOrder())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ToggleResult {
        private boolean isCompleted;
        private LocalDateTime completedAt;
        private InstanceProgress instanceProgress;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class InstanceProgress {
        private int completedItems;
        private int totalItems;
        private int progressPercent;
        private String status;
    }

    @Getter
    @AllArgsConstructor
    public static class DepartmentInfo {
        private String id;
        private String name;
    }

    @Getter
    @AllArgsConstructor
    public static class JobGroupInfo {
        private String id;
        private String name;
    }
}
