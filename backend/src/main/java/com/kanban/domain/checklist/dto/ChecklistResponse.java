package com.kanban.domain.checklist.dto;

import com.kanban.domain.checklist.ChecklistItem;
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
        private LocalDate dueDate;
        private Integer position;
        private LocalDateTime createdAt;
        private LocalDateTime completedAt;

        public static Detail of(ChecklistItem item) {
            return Detail.builder()
                    .id(item.getId())
                    .title(item.getTitle())
                    .completed(item.getIsCompleted())
                    .assignee(item.getAssignee() != null ? AssigneeInfo.of(item) : null)
                    .dueDate(item.getDueDate())
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
}
