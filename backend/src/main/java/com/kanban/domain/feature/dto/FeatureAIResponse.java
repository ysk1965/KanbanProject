package com.kanban.domain.feature.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class FeatureAIResponse {

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TaskDecomposition {
        private String featureId;
        private String featureTitle;
        private List<TaskSuggestion> tasks;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TaskSuggestion {
        private String title;
        private String description;
        private List<ChecklistSuggestion> checklists;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChecklistSuggestion {
        private String title;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ApplyResult {
        private int tasksCreated;
        private int checklistsCreated;
    }
}
