package com.kanban.domain.personal.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Getter
@Builder
@AllArgsConstructor
public class BoardTasksResponse {

    private List<BoardGroup> boards;
    private int totalPending;
    private int totalCompletedToday;

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardGroup {
        private String boardId;
        private String boardName;
        private String backgroundGradient;
        private List<BoardItem> items;
        private int pendingCount;
        private int completedTodayCount;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardItem {
        private String type; // CHECKLIST, DAILY_CHECKLIST, MEETING

        // Common
        private String title;

        // CHECKLIST fields
        private String checklistItemId;
        private String taskTitle;
        private String featureTitle;
        private String featureColor;
        private LocalDate dueDate;
        private Boolean isCompleted;

        // DAILY_CHECKLIST fields
        private String dailyChecklistId;

        // MEETING fields
        private String meetingId;
        private LocalTime startTime;
        private LocalTime endTime;
    }
}
