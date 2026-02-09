package com.kanban.domain.meeting.dto;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class MeetingAIRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Apply {
        @NotNull(message = "적용할 항목 목록은 필수입니다")
        private List<FeatureSuggestionApply> features;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FeatureSuggestionApply {
        private String type;
        private String featureId;
        private String title;
        private String description;
        private String color;
        private List<TaskSuggestionApply> tasks;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TaskSuggestionApply {
        private String title;
        private String description;
        private List<ChecklistSuggestionApply> checklists;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChecklistSuggestionApply {
        private String title;
    }
}
