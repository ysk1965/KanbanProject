package com.kanban.domain.personal.dto;

import com.kanban.domain.personal.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;

public class PersonalTaskResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String title;
        private String description;
        private PersonalTaskStatus status;
        private PersonalTaskPriority priority;
        private LocalDate dueDate;
        private String category;
        private String color;
        private int position;
        private LocalDateTime completedAt;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        /** 백로그: 어느 보드에서 적었나 (NULL이면 마이스페이스 전역) */
        private String boardId;
        private PersonalTaskPromotionType promotedType;
        private String promotedRefId;
        private LocalDateTime promotedAt;
        /** 승격 결과를 카드에 한 줄로 보여주기 위한 이름 (태스크 제목 · 블록 제목 등) */
        private String promotedLabel;

        public static Detail of(PersonalTask task) {
            return of(task, null);
        }

        public static Detail of(PersonalTask task, String promotedLabel) {
            return Detail.builder()
                    .boardId(task.getBoardId())
                    .promotedType(task.getPromotedType())
                    .promotedRefId(task.getPromotedRefId())
                    .promotedAt(task.getPromotedAt())
                    .promotedLabel(promotedLabel)
                    .id(task.getId())
                    .title(task.getTitle())
                    .description(task.getDescription())
                    .status(task.getStatus())
                    .priority(task.getPriority())
                    .dueDate(task.getDueDate())
                    .category(task.getCategory())
                    .color(task.getColor())
                    .position(task.getPosition())
                    .completedAt(task.getCompletedAt())
                    .createdAt(task.getCreatedAt())
                    .updatedAt(task.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Summary {
        private String id;
        private String title;
        private PersonalTaskStatus status;
        private PersonalTaskPriority priority;
        private LocalDate dueDate;
        private String category;

        public static Summary of(PersonalTask task) {
            return Summary.builder()
                    .id(task.getId())
                    .title(task.getTitle())
                    .status(task.getStatus())
                    .priority(task.getPriority())
                    .dueDate(task.getDueDate())
                    .category(task.getCategory())
                    .build();
        }
    }

}
