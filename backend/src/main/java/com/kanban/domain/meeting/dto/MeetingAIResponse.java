package com.kanban.domain.meeting.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

public class MeetingAIResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Suggestions {
        private String meetingId;
        private String meetingTitle;
        private List<String> keyPoints;
        private List<SummaryTopic> summary;
        private List<FeatureSuggestion> features;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SummaryTopic {
        private String topic;
        private boolean important;
        private List<String> points;
    }

    @Getter
    @Builder
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
    @AllArgsConstructor
    public static class TaskSuggestion {
        private String title;
        private String description;
        private List<ChecklistSuggestion> checklists;
    }

    @Getter
    @Builder
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
