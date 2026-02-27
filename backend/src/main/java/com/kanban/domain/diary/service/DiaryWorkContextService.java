package com.kanban.domain.diary.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.diary.dto.DiaryWorkContextResponse;
import com.kanban.domain.personal.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DiaryWorkContextService {

    private final BoardMemberRepository boardMemberRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final PersonalTaskRepository personalTaskRepository;
    private final PersonalHabitRepository personalHabitRepository;
    private final PersonalHabitLogRepository personalHabitLogRepository;

    public DiaryWorkContextResponse getWorkContext(String userId, LocalDate date) {
        LocalDate today = (date != null) ? date : LocalDate.now(ZoneOffset.UTC);
        LocalDateTime dayStart = today.atStartOfDay();
        LocalDateTime dayEnd = today.plusDays(1).atStartOfDay();

        // 1. Board completed items today
        List<DiaryWorkContextResponse.BoardCompletedGroup> completedToday = getBoardCompletedToday(userId, dayStart, dayEnd);

        // 2. Personal completed items today
        List<DiaryWorkContextResponse.PersonalCompletedItem> personalCompleted = getPersonalCompletedToday(userId, today, dayStart, dayEnd);

        // 3. Weekly summary
        DiaryWorkContextResponse.WeeklySummary weeklySummary = getWeeklySummary(userId, today);

        return DiaryWorkContextResponse.builder()
                .date(today)
                .completedToday(completedToday)
                .personalCompletedToday(personalCompleted)
                .weeklySummary(weeklySummary)
                .build();
    }

    private List<DiaryWorkContextResponse.BoardCompletedGroup> getBoardCompletedToday(
            String userId, LocalDateTime dayStart, LocalDateTime dayEnd) {
        List<BoardMember> boardMembers = boardMemberRepository.findByUserIdWithActiveBoards(userId);
        if (boardMembers.isEmpty()) {
            return Collections.emptyList();
        }

        List<String> boardIds = boardMembers.stream()
                .map(bm -> bm.getBoard().getId())
                .toList();

        Map<String, Board> boardMap = boardMembers.stream()
                .collect(Collectors.toMap(bm -> bm.getBoard().getId(), BoardMember::getBoard, (a, b) -> a));

        List<ChecklistItem> completedItems = checklistItemRepository
                .findCompletedByAssigneeAndBoardIdsAndDateRange(userId, boardIds, dayStart, dayEnd);

        if (completedItems.isEmpty()) {
            return Collections.emptyList();
        }

        // Group by board
        Map<String, List<ChecklistItem>> byBoard = completedItems.stream()
                .collect(Collectors.groupingBy(ci -> ci.getTask().getBoard().getId()));

        List<DiaryWorkContextResponse.BoardCompletedGroup> groups = new ArrayList<>();
        for (Map.Entry<String, List<ChecklistItem>> entry : byBoard.entrySet()) {
            Board board = boardMap.get(entry.getKey());
            if (board == null) continue;

            List<DiaryWorkContextResponse.BoardCompletedItem> items = entry.getValue().stream()
                    .map(ci -> DiaryWorkContextResponse.BoardCompletedItem.builder()
                            .type("CHECKLIST_ITEM")
                            .title(ci.getTitle())
                            .taskTitle(ci.getTask().getTitle())
                            .featureTitle(ci.getTask().getFeature().getTitle())
                            .completedAt(ci.getCompletedAt())
                            .build())
                    .toList();

            groups.add(DiaryWorkContextResponse.BoardCompletedGroup.builder()
                    .boardName(board.getName())
                    .backgroundGradient(board.getBackgroundGradient())
                    .items(items)
                    .build());
        }

        return groups;
    }

    private List<DiaryWorkContextResponse.PersonalCompletedItem> getPersonalCompletedToday(
            String userId, LocalDate today, LocalDateTime dayStart, LocalDateTime dayEnd) {

        List<DiaryWorkContextResponse.PersonalCompletedItem> items = new ArrayList<>();

        // Completed personal tasks
        List<PersonalTask> completedTasks = personalTaskRepository
                .findByUserIdAndStatus(userId, PersonalTaskStatus.DONE).stream()
                .filter(t -> t.getCompletedAt() != null
                        && !t.getCompletedAt().isBefore(dayStart)
                        && t.getCompletedAt().isBefore(dayEnd))
                .toList();

        for (PersonalTask task : completedTasks) {
            items.add(DiaryWorkContextResponse.PersonalCompletedItem.builder()
                    .title(task.getTitle())
                    .type("TASK")
                    .completedAt(task.getCompletedAt())
                    .build());
        }

        // Completed habits today
        List<PersonalHabit> activeHabits = personalHabitRepository.findActiveByUserId(userId);
        if (!activeHabits.isEmpty()) {
            List<String> habitIds = activeHabits.stream().map(PersonalHabit::getId).toList();
            List<PersonalHabitLog> habitLogs = personalHabitLogRepository.findByHabitIdsAndDate(habitIds, today);
            for (PersonalHabitLog habitLog : habitLogs) {
                if (habitLog.getIsCompleted()) {
                    items.add(DiaryWorkContextResponse.PersonalCompletedItem.builder()
                            .title(habitLog.getHabit().getTitle())
                            .type("HABIT")
                            .completedAt(habitLog.getUpdatedAt() != null ? habitLog.getUpdatedAt() : today.atStartOfDay())
                            .build());
                }
            }
        }

        return items;
    }

    private DiaryWorkContextResponse.WeeklySummary getWeeklySummary(String userId, LocalDate today) {
        // This week: Mon ~ Sun
        LocalDate thisWeekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate thisWeekEnd = today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
        LocalDateTime thisWeekStartDt = thisWeekStart.atStartOfDay();
        LocalDateTime thisWeekEndDt = thisWeekEnd.plusDays(1).atStartOfDay();

        // Previous week
        LocalDate prevWeekStart = thisWeekStart.minusWeeks(1);
        LocalDateTime prevWeekStartDt = prevWeekStart.atStartOfDay();
        LocalDateTime prevWeekEndDt = thisWeekStart.atStartOfDay();

        // Board completed counts
        List<BoardMember> boardMembers = boardMemberRepository.findByUserIdWithActiveBoards(userId);
        long thisWeekBoardCompleted = 0;
        long prevWeekBoardCompleted = 0;
        String mostActiveBoard = null;

        if (!boardMembers.isEmpty()) {
            List<String> boardIds = boardMembers.stream()
                    .map(bm -> bm.getBoard().getId())
                    .toList();

            Map<String, Board> boardMap = boardMembers.stream()
                    .collect(Collectors.toMap(bm -> bm.getBoard().getId(), BoardMember::getBoard, (a, b) -> a));

            List<ChecklistItem> thisWeekItems = checklistItemRepository
                    .findCompletedByAssigneeAndBoardIdsAndDateRange(userId, boardIds, thisWeekStartDt, thisWeekEndDt);

            thisWeekBoardCompleted = thisWeekItems.size();

            List<ChecklistItem> prevWeekItems = checklistItemRepository
                    .findCompletedByAssigneeAndBoardIdsAndDateRange(userId, boardIds, prevWeekStartDt, prevWeekEndDt);

            prevWeekBoardCompleted = prevWeekItems.size();

            // Find most active board (by this week's completed count)
            if (!thisWeekItems.isEmpty()) {
                Map<String, Long> boardCounts = thisWeekItems.stream()
                        .collect(Collectors.groupingBy(
                                ci -> ci.getTask().getBoard().getId(),
                                Collectors.counting()));

                String topBoardId = boardCounts.entrySet().stream()
                        .max(Map.Entry.comparingByValue())
                        .map(Map.Entry::getKey)
                        .orElse(null);

                if (topBoardId != null) {
                    Board topBoard = boardMap.get(topBoardId);
                    if (topBoard != null) {
                        mostActiveBoard = topBoard.getName();
                    }
                }
            }
        }

        // Personal completed counts
        long thisWeekPersonalCompleted = personalTaskRepository.countCompletedSince(userId, thisWeekStartDt);
        long allSincePrevWeek = personalTaskRepository.countCompletedSince(userId, prevWeekStartDt);
        long prevWeekPersonalCompleted = allSincePrevWeek - thisWeekPersonalCompleted;

        long totalCompleted = thisWeekBoardCompleted + thisWeekPersonalCompleted;
        long previousWeekCompleted = prevWeekBoardCompleted + Math.max(0, prevWeekPersonalCompleted);

        double changePercentage = previousWeekCompleted > 0
                ? Math.round(((double) (totalCompleted - previousWeekCompleted) / previousWeekCompleted) * 1000.0) / 10.0
                : (totalCompleted > 0 ? 100.0 : 0.0);

        return DiaryWorkContextResponse.WeeklySummary.builder()
                .totalCompleted(totalCompleted)
                .previousWeekCompleted(previousWeekCompleted)
                .changePercentage(changePercentage)
                .mostActiveBoard(mostActiveBoard)
                .build();
    }
}
