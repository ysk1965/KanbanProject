package com.kanban.domain.personal.dto;

import com.kanban.domain.personal.HabitFrequency;
import com.kanban.domain.personal.PersonalHabit;
import com.kanban.domain.personal.PersonalHabitLog;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class PersonalHabitResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String title;
        private String description;
        private String icon;
        private String color;
        private HabitFrequency frequencyType;
        private String frequencyDays;
        private int targetCount;
        private String unit;
        private int currentStreak;
        private int bestStreak;
        private int position;
        private boolean isActive;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(PersonalHabit habit) {
            return Detail.builder()
                    .id(habit.getId())
                    .title(habit.getTitle())
                    .description(habit.getDescription())
                    .icon(habit.getIcon())
                    .color(habit.getColor())
                    .frequencyType(habit.getFrequencyType())
                    .frequencyDays(habit.getFrequencyDays())
                    .targetCount(habit.getTargetCount())
                    .unit(habit.getUnit())
                    .currentStreak(habit.getCurrentStreak())
                    .bestStreak(habit.getBestStreak())
                    .position(habit.getPosition())
                    .isActive(habit.getIsActive())
                    .createdAt(habit.getCreatedAt())
                    .updatedAt(habit.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TodayItem {
        private String habitId;
        private String title;
        private String icon;
        private String color;
        private int targetCount;
        private int completedCount;
        private boolean isCompleted;
        private String unit;
        private int currentStreak;

        public static TodayItem of(PersonalHabit habit, PersonalHabitLog log) {
            return TodayItem.builder()
                    .habitId(habit.getId())
                    .title(habit.getTitle())
                    .icon(habit.getIcon())
                    .color(habit.getColor())
                    .targetCount(habit.getTargetCount())
                    .completedCount(log != null ? log.getCompletedCount() : 0)
                    .isCompleted(log != null && log.getIsCompleted())
                    .unit(habit.getUnit())
                    .currentStreak(habit.getCurrentStreak())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class LogEntry {
        private String id;
        private LocalDate logDate;
        private int completedCount;
        private boolean isCompleted;
        private String note;

        public static LogEntry of(PersonalHabitLog log) {
            return LogEntry.builder()
                    .id(log.getId())
                    .logDate(log.getLogDate())
                    .completedCount(log.getCompletedCount())
                    .isCompleted(log.getIsCompleted())
                    .note(log.getNote())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class WeeklyMatrix {
        private List<HabitWeeklyRow> habits;
        private LocalDate startDate;
        private LocalDate endDate;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class HabitWeeklyRow {
        private String habitId;
        private String title;
        private String icon;
        private String color;
        private List<DayStatus> days;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class DayStatus {
        private LocalDate date;
        private int completedCount;
        private int targetCount;
        private boolean isCompleted;
    }
}
