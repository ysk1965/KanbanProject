package com.kanban.domain.personal.service;

import com.kanban.domain.personal.*;
import com.kanban.domain.personal.dto.PersonalHabitRequest;
import com.kanban.domain.personal.dto.PersonalHabitResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PersonalHabitService {

    private final PersonalHabitRepository habitRepository;
    private final PersonalHabitLogRepository habitLogRepository;
    private final UserRepository userRepository;

    // ─── Habit CRUD ───

    public List<PersonalHabitResponse.Detail> getActiveHabits(String userId) {
        return habitRepository.findActiveByUserId(userId).stream()
                .map(PersonalHabitResponse.Detail::of)
                .toList();
    }

    public PersonalHabitResponse.Detail getHabit(String userId, String habitId) {
        PersonalHabit habit = findHabitAndVerifyOwner(userId, habitId);
        return PersonalHabitResponse.Detail.of(habit);
    }

    @Transactional
    public PersonalHabitResponse.Detail createHabit(String userId, PersonalHabitRequest.Create request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        PersonalHabit habit = PersonalHabit.builder()
                .user(user)
                .title(request.getTitle())
                .description(request.getDescription())
                .icon(request.getIcon())
                .color(request.getColor() != null ? request.getColor() : "#8B5CF6")
                .frequencyType(request.getFrequencyType() != null ? request.getFrequencyType() : HabitFrequency.DAILY)
                .frequencyDays(request.getFrequencyDays())
                .targetCount(request.getTargetCount() != null ? request.getTargetCount() : 1)
                .unit(request.getUnit())
                .importance(request.getImportance() != null ? request.getImportance() : HabitImportance.MEDIUM)
                .build();

        habitRepository.save(habit);
        return PersonalHabitResponse.Detail.of(habit);
    }

    @Transactional
    public PersonalHabitResponse.Detail updateHabit(String userId, String habitId, PersonalHabitRequest.Update request) {
        PersonalHabit habit = findHabitAndVerifyOwner(userId, habitId);
        habit.update(request.getTitle(), request.getDescription(), request.getIcon(), request.getColor(),
                request.getFrequencyType(), request.getFrequencyDays(),
                request.getTargetCount(), request.getUnit(), request.getImportance());
        return PersonalHabitResponse.Detail.of(habit);
    }

    @Transactional
    public void deactivateHabit(String userId, String habitId) {
        PersonalHabit habit = findHabitAndVerifyOwner(userId, habitId);
        habit.deactivate();
    }

    @Transactional
    public void updateHabitPosition(String userId, String habitId, int position) {
        PersonalHabit habit = findHabitAndVerifyOwner(userId, habitId);
        habit.updatePosition(position);
    }

    // ─── Check-in ───

    @Transactional
    public PersonalHabitResponse.TodayItem checkIn(String userId, String habitId, PersonalHabitRequest.CheckIn request) {
        PersonalHabit habit = findHabitAndVerifyOwner(userId, habitId);
        LocalDate targetDate = (request != null && request.getLogDate() != null)
                ? request.getLogDate()
                : LocalDate.now(ZoneOffset.UTC);

        PersonalHabitLog log = habitLogRepository.findByHabitIdAndLogDate(habitId, targetDate)
                .orElseGet(() -> {
                    PersonalHabitLog newLog = PersonalHabitLog.builder()
                            .habit(habit)
                            .logDate(targetDate)
                            .build();
                    return habitLogRepository.save(newLog);
                });

        if (habit.getTargetCount() > 1) {
            log.incrementCount(habit.getTargetCount());
        } else {
            log.toggleComplete(habit.getTargetCount());
        }

        if (request != null && request.getNote() != null) {
            // note is set via builder, we need to handle it
        }

        updateStreak(habit, targetDate);

        // Recalculate weekly stats
        LocalDate weekStart = targetDate.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate weekEnd = targetDate.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
        int weeklyTarget = getWeeklyTarget(habit, weekStart, weekEnd);
        int weeklyCompleted = (int) habitLogRepository
                .findByHabitIdAndDateRange(habitId, weekStart, weekEnd)
                .stream().filter(PersonalHabitLog::getIsCompleted).count();

        return PersonalHabitResponse.TodayItem.of(habit, log, weeklyTarget, weeklyCompleted);
    }

    // ─── Today / Weekly ───

    public List<PersonalHabitResponse.TodayItem> getTodayHabits(String userId, LocalDate date) {
        List<PersonalHabit> habits = habitRepository.findActiveByUserId(userId);
        LocalDate today = (date != null) ? date : LocalDate.now(ZoneOffset.UTC);

        List<String> habitIds = habits.stream().map(PersonalHabit::getId).toList();
        Map<String, PersonalHabitLog> logMap = habitLogRepository.findByHabitIdsAndDate(habitIds, today)
                .stream()
                .collect(Collectors.toMap(l -> l.getHabit().getId(), l -> l));

        // Weekly stats: Monday ~ Sunday
        LocalDate weekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate weekEnd = today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
        Map<String, List<PersonalHabitLog>> weeklyLogs = habitLogRepository
                .findByHabitIdsAndDateRange(habitIds, weekStart, weekEnd)
                .stream()
                .collect(Collectors.groupingBy(l -> l.getHabit().getId()));

        return habits.stream()
                .filter(h -> isScheduledForDate(h, today))
                .map(h -> {
                    int weeklyTarget = getWeeklyTarget(h, weekStart, weekEnd);
                    int weeklyCompleted = (int) weeklyLogs.getOrDefault(h.getId(), List.of())
                            .stream().filter(PersonalHabitLog::getIsCompleted).count();
                    return PersonalHabitResponse.TodayItem.of(
                            h, logMap.get(h.getId()), weeklyTarget, weeklyCompleted);
                })
                .toList();
    }

    public List<PersonalHabitResponse.LogEntry> getHabitLogs(String userId, String habitId, LocalDate startDate, LocalDate endDate) {
        findHabitAndVerifyOwner(userId, habitId);
        return habitLogRepository.findByHabitIdAndDateRange(habitId, startDate, endDate).stream()
                .map(PersonalHabitResponse.LogEntry::of)
                .toList();
    }

    public PersonalHabitResponse.WeeklyMatrix getWeeklyMatrix(String userId, LocalDate startDate, LocalDate endDate) {
        List<PersonalHabit> habits = habitRepository.findActiveByUserId(userId);
        List<String> habitIds = habits.stream().map(PersonalHabit::getId).toList();

        Map<String, List<PersonalHabitLog>> logsByHabit = habitLogRepository
                .findByHabitIdsAndDateRange(habitIds, startDate, endDate)
                .stream()
                .collect(Collectors.groupingBy(l -> l.getHabit().getId()));

        List<PersonalHabitResponse.HabitWeeklyRow> rows = habits.stream().map(habit -> {
            Map<LocalDate, PersonalHabitLog> dateLogMap = logsByHabit.getOrDefault(habit.getId(), List.of())
                    .stream()
                    .collect(Collectors.toMap(PersonalHabitLog::getLogDate, l -> l));

            List<PersonalHabitResponse.DayStatus> days = new ArrayList<>();
            for (LocalDate date = startDate; !date.isAfter(endDate); date = date.plusDays(1)) {
                PersonalHabitLog log = dateLogMap.get(date);
                days.add(PersonalHabitResponse.DayStatus.builder()
                        .date(date)
                        .completedCount(log != null ? log.getCompletedCount() : 0)
                        .targetCount(habit.getTargetCount())
                        .isCompleted(log != null && log.getIsCompleted())
                        .build());
            }

            return PersonalHabitResponse.HabitWeeklyRow.builder()
                    .habitId(habit.getId())
                    .title(habit.getTitle())
                    .icon(habit.getIcon())
                    .color(habit.getColor())
                    .days(days)
                    .build();
        }).toList();

        return PersonalHabitResponse.WeeklyMatrix.builder()
                .habits(rows)
                .startDate(startDate)
                .endDate(endDate)
                .build();
    }

    // ─── Helpers ───

    private void updateStreak(PersonalHabit habit, LocalDate today) {
        LocalDate currentWeekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate currentWeekEnd = today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));

        // Fetch all logs for up to 53 weeks in one query
        LocalDate fetchStart = currentWeekStart.minusWeeks(53);
        List<PersonalHabitLog> allLogs = habitLogRepository
                .findByHabitIdAndDateRange(habit.getId(), fetchStart, currentWeekEnd);

        Set<LocalDate> completedDates = allLogs.stream()
                .filter(PersonalHabitLog::getIsCompleted)
                .map(PersonalHabitLog::getLogDate)
                .collect(Collectors.toSet());

        int streak = 0;

        // Check current week first
        int currentTarget = getWeeklyTarget(habit, currentWeekStart, currentWeekEnd);
        if (currentTarget > 0 && countCompletedInRange(completedDates, currentWeekStart, currentWeekEnd) >= currentTarget) {
            streak++;
        }

        // Check previous weeks going backward
        LocalDate weekStart = currentWeekStart.minusWeeks(1);
        while (!weekStart.isBefore(fetchStart)) {
            LocalDate weekEnd = weekStart.plusDays(6);
            int target = getWeeklyTarget(habit, weekStart, weekEnd);
            if (target == 0) break;

            if (countCompletedInRange(completedDates, weekStart, weekEnd) >= target) {
                streak++;
            } else {
                break;
            }
            weekStart = weekStart.minusWeeks(1);
        }

        habit.updateStreak(streak);
    }

    private int countCompletedInRange(Set<LocalDate> completedDates, LocalDate start, LocalDate end) {
        int count = 0;
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            if (completedDates.contains(d)) count++;
        }
        return count;
    }

    private int getWeeklyTarget(PersonalHabit habit, LocalDate weekStart, LocalDate weekEnd) {
        int count = 0;
        for (LocalDate d = weekStart; !d.isAfter(weekEnd); d = d.plusDays(1)) {
            if (isScheduledForDate(habit, d)) count++;
        }
        return count;
    }

    boolean isScheduledForDate(PersonalHabit habit, LocalDate date) {
        return switch (habit.getFrequencyType()) {
            case DAILY -> true;
            case WEEKDAY -> date.getDayOfWeek().getValue() <= 5;
            case WEEKEND -> date.getDayOfWeek().getValue() >= 6;
            case CUSTOM -> {
                if (habit.getFrequencyDays() == null) yield true;
                // Frontend uses JS convention: 0=Sunday, 1=Monday, ..., 6=Saturday
                int iso = date.getDayOfWeek().getValue(); // 1(Mon)~7(Sun)
                List<String> days = java.util.Arrays.asList(habit.getFrequencyDays().split(","));
                if (iso == 7) {
                    // Sunday: accept both "0" (JS convention) and "7" (legacy Java convention)
                    yield days.contains("0") || days.contains("7");
                }
                yield days.contains(String.valueOf(iso));
            }
        };
    }

    private PersonalHabit findHabitAndVerifyOwner(String userId, String habitId) {
        PersonalHabit habit = habitRepository.findById(habitId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PERSONAL_HABIT_NOT_FOUND));
        if (!habit.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.PERSONAL_ACCESS_DENIED);
        }
        return habit;
    }
}
