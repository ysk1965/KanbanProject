package com.kanban.domain.personal.dto;

import com.kanban.domain.personal.dto.PersonalEventResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
@AllArgsConstructor
public class PersonalDashboardResponse {
    private List<PersonalTaskResponse.Detail> dueTodayTasks;
    private List<PersonalTaskResponse.Detail> inProgressTasks;
    private List<PersonalEventResponse.Detail> personalEvents;
    private List<PersonalHabitResponse.TodayItem> habitsToday;
    private double taskCompletionRate;
    private double habitCompletionRate;
    private long activeTaskCount;
    private long completedTodayCount;

    // Diary today status
    private DiaryTodayInfo diaryToday;

    @Getter
    @Builder
    @AllArgsConstructor
    public static class DiaryTodayInfo {
        private String id;
        private String status; // CHATTING, COMPLETED
        private String title;
        private String mood;
    }
}
