package com.kanban.domain.personal.service;

import com.kanban.domain.diary.DiaryEntry;
import com.kanban.domain.diary.DiaryEntryRepository;
import com.kanban.domain.personal.*;
import com.kanban.domain.personal.dto.PersonalDashboardResponse;
import com.kanban.domain.personal.dto.PersonalEventResponse;
import com.kanban.domain.personal.dto.PersonalHabitResponse;
import com.kanban.domain.personal.dto.PersonalTaskResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PersonalDashboardService {

    private final PersonalTaskRepository personalTaskRepository;
    private final PersonalHabitRepository habitRepository;
    private final PersonalHabitLogRepository habitLogRepository;
    private final PersonalEventRepository personalEventRepository;
    private final PersonalHabitService personalHabitService;
    private final DiaryEntryRepository diaryEntryRepository;

    public PersonalDashboardResponse getTodayDashboard(String userId, LocalDate date) {
        LocalDate today = (date != null) ? date : LocalDate.now(ZoneOffset.UTC);
        LocalDateTime startOfDay = today.atStartOfDay();

        // Due today tasks
        List<PersonalTaskResponse.Detail> dueTodayTasks = personalTaskRepository
                .findByUserIdAndDueDate(userId, today).stream()
                .map(PersonalTaskResponse.Detail::of)
                .toList();

        // In progress tasks
        List<PersonalTaskResponse.Detail> inProgressTasks = personalTaskRepository
                .findInProgressByUserId(userId).stream()
                .map(PersonalTaskResponse.Detail::of)
                .toList();

        // Personal events
        List<PersonalEventResponse.Detail> personalEvents = personalEventRepository
                .findByUserIdAndDate(userId, today).stream()
                .map(PersonalEventResponse.Detail::of)
                .toList();

        // Habits today — filter by scheduled day of week
        List<PersonalHabit> activeHabits = habitRepository.findActiveByUserId(userId);
        List<PersonalHabit> scheduledHabits = activeHabits.stream()
                .filter(h -> personalHabitService.isScheduledForDate(h, today))
                .toList();
        List<String> habitIds = scheduledHabits.stream().map(PersonalHabit::getId).toList();
        Map<String, PersonalHabitLog> logMap = habitLogRepository.findByHabitIdsAndDate(habitIds, today)
                .stream()
                .collect(Collectors.toMap(l -> l.getHabit().getId(), l -> l));

        // Weekly stats
        LocalDate weekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate weekEnd = today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
        Map<String, List<PersonalHabitLog>> weeklyLogs = habitLogRepository
                .findByHabitIdsAndDateRange(
                        activeHabits.stream().map(PersonalHabit::getId).toList(),
                        weekStart, weekEnd)
                .stream()
                .collect(Collectors.groupingBy(l -> l.getHabit().getId()));

        List<PersonalHabitResponse.TodayItem> habitsToday = scheduledHabits.stream()
                .map(h -> {
                    int weeklyTarget = 0;
                    for (LocalDate d = weekStart; !d.isAfter(weekEnd); d = d.plusDays(1)) {
                        if (personalHabitService.isScheduledForDate(h, d)) weeklyTarget++;
                    }
                    int weeklyCompleted = (int) weeklyLogs.getOrDefault(h.getId(), List.of())
                            .stream().filter(PersonalHabitLog::getIsCompleted).count();
                    return PersonalHabitResponse.TodayItem.of(h, logMap.get(h.getId()), weeklyTarget, weeklyCompleted);
                })
                .toList();

        // Stats
        long activeTaskCount = personalTaskRepository.countActiveByUserId(userId);
        long completedTodayCount = personalTaskRepository.countCompletedSince(userId, startOfDay);

        double taskCompletionRate = activeTaskCount > 0
                ? (double) personalTaskRepository.countByUserIdAndStatus(userId, PersonalTaskStatus.DONE) / activeTaskCount
                : 0.0;

        long totalHabitsToday = habitsToday.size();
        long completedHabitsToday = habitLogRepository.countCompletedByUserIdAndDate(userId, today);
        double habitCompletionRate = totalHabitsToday > 0
                ? (double) completedHabitsToday / totalHabitsToday
                : 0.0;

        // Diary today
        Optional<DiaryEntry> diaryOpt = diaryEntryRepository.findByUserIdAndDate(userId, today);
        PersonalDashboardResponse.DiaryTodayInfo diaryToday = diaryOpt
                .map(d -> PersonalDashboardResponse.DiaryTodayInfo.builder()
                        .id(d.getId())
                        .status(d.getStatus().name())
                        .title(d.getTitle())
                        .mood(d.getMood())
                        .build())
                .orElse(null);

        return PersonalDashboardResponse.builder()
                .dueTodayTasks(dueTodayTasks)
                .inProgressTasks(inProgressTasks)
                .personalEvents(personalEvents)
                .habitsToday(habitsToday)
                .taskCompletionRate(Math.round(taskCompletionRate * 100.0) / 100.0)
                .habitCompletionRate(Math.round(habitCompletionRate * 100.0) / 100.0)
                .activeTaskCount(activeTaskCount)
                .completedTodayCount(completedTodayCount)
                .diaryToday(diaryToday)
                .build();
    }
}
