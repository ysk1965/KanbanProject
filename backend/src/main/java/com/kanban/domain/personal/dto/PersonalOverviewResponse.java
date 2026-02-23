package com.kanban.domain.personal.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
@AllArgsConstructor
public class PersonalOverviewResponse {
    private List<PersonalTaskResponse.Detail> allTasks;
    private List<PersonalHabitResponse.Detail> allHabits;
    private List<PersonalHabitResponse.TodayItem> habitsToday;
    private PersonalHabitResponse.WeeklyMatrix weeklyMatrix;
    private List<PersonalEventResponse.Detail> todayEvents;
    private List<PersonalTaskResponse.Detail> dueTodayTasks;
    private List<PersonalTaskResponse.Detail> inProgressTasks;
    private double taskCompletionRate;
    private double habitCompletionRate;
    private long activeTaskCount;
    private long completedTodayCount;
    private DiaryOverviewInfo diaryToday;

    @Getter
    @Builder
    @AllArgsConstructor
    public static class DiaryOverviewInfo {
        private String id;
        private String status;
        private String title;
        private String mood;
        private String lastMessageContent;
        private String lastMessageRole;
    }
}
