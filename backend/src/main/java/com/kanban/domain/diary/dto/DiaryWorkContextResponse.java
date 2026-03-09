package com.kanban.domain.diary.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Getter
@Builder
@AllArgsConstructor
public class DiaryWorkContextResponse {

    private LocalDate date;
    private List<BoardCompletedGroup> completedToday;
    private List<PersonalCompletedItem> personalCompletedToday;
    private WeeklySummary weeklySummary;

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardCompletedGroup {
        private String boardName;
        private String backgroundGradient;
        private List<BoardCompletedItem> items;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardCompletedItem {
        private String type; // CHECKLIST_ITEM
        private String title;
        private String taskTitle;
        private String featureTitle;
        private LocalDateTime completedAt;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PersonalCompletedItem {
        private String title;
        private String type; // TASK, HABIT
        private LocalDateTime completedAt;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class WeeklySummary {
        private long totalCompleted;
        private long previousWeekCompleted;
        private double changePercentage;
        private String mostActiveBoard;
    }
}
