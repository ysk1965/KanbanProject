package com.kanban.domain.personal.dto;

import com.kanban.domain.personal.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

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

    /**
     * 붙일 곳 추천 결과.
     *
     * <p>source가 RULE이어도 목록은 비지 않는다 — AI가 실패하든 크레딧이 없든
     * 규칙 점수 상위가 그대로 답이 된다. 추천 자리가 비는 게 가장 나쁜 결과다.
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class PromoteSuggestions {
        /** "AI" | "RULE" */
        private String source;
        /** 이번 호출에서 실제로 쓴 크레딧. 캐시에 맞으면 0이다. */
        private int creditsUsed;
        /** AI를 요청했지만 크레딧이 없어 규칙으로 내려온 경우 — 프런트가 안내 한 줄을 띄운다 */
        private boolean creditsExhausted;
        private List<PromoteSuggestion> suggestions;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PromoteSuggestion {
        /** 붙일 대상 id (태스크 id 또는 피처 id) */
        private String refId;
        /** "TASK" | "FEATURE" */
        private String refType;
        private double score;
        /** 규칙 추천의 근거 코드 — 문구는 프런트가 언어에 맞게 그린다 (AI 추천이면 null) */
        private String reasonCode;
        /** 근거 문구를 만들 때 쓰는 값 (겹친 낱말 등). 코드에 따라 비어 있을 수 있다. */
        private List<String> reasonTokens;
        /** AI가 쓴 이유 문장 (규칙 추천이면 null) */
        private String reason;
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
