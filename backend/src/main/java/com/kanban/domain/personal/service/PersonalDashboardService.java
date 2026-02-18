package com.kanban.domain.personal.service;

import com.kanban.domain.personal.*;
import com.kanban.domain.personal.dto.PersonalDashboardResponse;
import com.kanban.domain.personal.dto.PersonalEventResponse;
import com.kanban.domain.personal.dto.PersonalHabitResponse;
import com.kanban.domain.personal.dto.PersonalTaskResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PersonalDashboardService {

    private final PersonalTaskRepository personalTaskRepository;
    private final PersonalHabitRepository habitRepository;
    private final PersonalHabitLogRepository habitLogRepository;
    private final PersonalEventRepository personalEventRepository;

    public PersonalDashboardResponse getTodayDashboard(String userId) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
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

        // Habits today
        List<PersonalHabit> activeHabits = habitRepository.findActiveByUserId(userId);
        List<String> habitIds = activeHabits.stream().map(PersonalHabit::getId).toList();
        Map<String, PersonalHabitLog> logMap = habitLogRepository.findByHabitIdsAndDate(habitIds, today)
                .stream()
                .collect(Collectors.toMap(l -> l.getHabit().getId(), l -> l));

        List<PersonalHabitResponse.TodayItem> habitsToday = activeHabits.stream()
                .map(h -> PersonalHabitResponse.TodayItem.of(h, logMap.get(h.getId()), 0, 0))
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

        return PersonalDashboardResponse.builder()
                .dueTodayTasks(dueTodayTasks)
                .inProgressTasks(inProgressTasks)
                .personalEvents(personalEvents)
                .habitsToday(habitsToday)
                .taskCompletionRate(Math.round(taskCompletionRate * 100.0) / 100.0)
                .habitCompletionRate(Math.round(habitCompletionRate * 100.0) / 100.0)
                .activeTaskCount(activeTaskCount)
                .completedTodayCount(completedTodayCount)
                .build();
    }
}
