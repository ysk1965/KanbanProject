package com.kanban.domain.feature.dto;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class FeatureAIRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ApplyDecomposition {
        @NotNull
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
