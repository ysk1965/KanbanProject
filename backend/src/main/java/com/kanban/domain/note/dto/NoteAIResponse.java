package com.kanban.domain.note.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class NoteAIResponse {

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Suggestions {
        private String noteId;
        private String noteTitle;
        private List<String> keyPoints;
        private List<SummaryTopic> summary;
        private List<FeatureSuggestion> features;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SummaryTopic {
        private String topic;
        private boolean important;
        private List<String> points;
        private List<String> decisions;
        private List<String> discussions;
        private List<String> actionItems;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FeatureSuggestion {
        private String type;
        private String featureId;
        private String title;
        private String description;
        private String color;
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
        private int featuresCreated;
        private int tasksCreated;
        private int checklistsCreated;
        private List<String> createdFeatureIds;
        private List<String> createdTaskIds;
    }
}
