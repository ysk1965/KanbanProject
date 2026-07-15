package com.kanban.domain.personal.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.dailychecklist.DailyChecklist;
import com.kanban.domain.dailychecklist.DailyChecklistRepository;
import com.kanban.domain.diary.DiaryEntry;
import com.kanban.domain.diary.DiaryEntryRepository;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.meeting.MeetingRepository;
import com.kanban.domain.organization.*;
import com.kanban.domain.organization.repository.OrgAnniversarySettingRepository;
import com.kanban.domain.organization.repository.OrgCelebrationMessageRepository;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.personal.*;
import com.kanban.domain.diary.DiaryMessage;
import com.kanban.domain.personal.dto.*;
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
public class PersonalDashboardService {

    private final PersonalTaskRepository personalTaskRepository;
    private final PersonalHabitRepository habitRepository;
    private final PersonalHabitLogRepository habitLogRepository;
    private final PersonalEventRepository personalEventRepository;
    private final PersonalHabitService personalHabitService;
    private final DiaryEntryRepository diaryEntryRepository;

    // Cross-Domain Integration dependencies
    private final BoardMemberRepository boardMemberRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final DailyChecklistRepository dailyChecklistRepository;
    private final MeetingRepository meetingRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final OrgAnniversarySettingRepository orgAnniversarySettingRepository;
    private final OrgCelebrationMessageRepository orgCelebrationMessageRepository;

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

    public PersonalOverviewResponse getOverview(String userId, LocalDate date) {
        LocalDate today = (date != null) ? date : LocalDate.now(ZoneOffset.UTC);

        // Reuse existing dashboard aggregation
        PersonalDashboardResponse dashboard = getTodayDashboard(userId, today);

        // All tasks (for PersonalTaskBoard + UpcomingDeadlinesWidget)
        List<PersonalTaskResponse.Detail> allTasks = personalTaskRepository
                .findByUserIdWithDetails(userId).stream()
                .map(PersonalTaskResponse.Detail::of)
                .toList();

        // All active habits
        List<PersonalHabitResponse.Detail> allHabits = personalHabitService.getActiveHabits(userId);

        // Weekly habit matrix
        LocalDate weekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate weekEnd = today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
        PersonalHabitResponse.WeeklyMatrix weeklyMatrix =
                personalHabitService.getWeeklyMatrix(userId, weekStart, weekEnd);

        // Diary with last message
        Optional<DiaryEntry> diaryOpt = diaryEntryRepository.findByUserIdAndDate(userId, today);
        PersonalOverviewResponse.DiaryOverviewInfo diaryToday = diaryOpt
                .map(d -> {
                    List<DiaryMessage> messages = d.getMessages();
                    DiaryMessage lastMsg = messages.isEmpty() ? null : messages.get(messages.size() - 1);
                    return PersonalOverviewResponse.DiaryOverviewInfo.builder()
                            .id(d.getId())
                            .status(d.getStatus().name())
                            .title(d.getTitle())
                            .mood(d.getMood())
                            .lastMessageContent(lastMsg != null ? lastMsg.getContent() : null)
                            .lastMessageRole(lastMsg != null ? lastMsg.getRole() : null)
                            .build();
                })
                .orElse(null);

        return PersonalOverviewResponse.builder()
                .allTasks(allTasks)
                .allHabits(allHabits)
                .habitsToday(dashboard.getHabitsToday())
                .weeklyMatrix(weeklyMatrix)
                .todayEvents(dashboard.getPersonalEvents())
                .dueTodayTasks(dashboard.getDueTodayTasks())
                .inProgressTasks(dashboard.getInProgressTasks())
                .taskCompletionRate(dashboard.getTaskCompletionRate())
                .habitCompletionRate(dashboard.getHabitCompletionRate())
                .activeTaskCount(dashboard.getActiveTaskCount())
                .completedTodayCount(dashboard.getCompletedTodayCount())
                .diaryToday(diaryToday)
                .build();
    }

    // ==================== Cross-Domain Integration: Board Tasks ====================

    /**
     * 크로스보드 "내 담당 미완료 체크리스트" 조회 (MCP list_my_checklist_items).
     * <p>
     * 커밋 ↔ 체크리스트 매칭에 쓰이므로 board_id · task_id · checklist_item_id 를 모두 노출한다.
     * 리포지토리 쿼리가 task · board · feature 를 JOIN FETCH 하므로 N+1 이 없다.
     */
    public MyChecklistItemsResponse getMyChecklistItems(String userId) {
        List<BoardMember> boardMembers = boardMemberRepository.findByUserIdWithActiveBoards(userId);
        if (boardMembers.isEmpty()) {
            return MyChecklistItemsResponse.builder().total(0).items(Collections.emptyList()).build();
        }
        List<String> boardIds = boardMembers.stream()
                .map(bm -> bm.getBoard().getId())
                .toList();
        List<ChecklistItem> items = checklistItemRepository
                .findByAssigneeIdAndBoardIdInAndNotCompleted(userId, boardIds);
        return MyChecklistItemsResponse.of(items);
    }

    public BoardTasksResponse getBoardTasks(String userId, LocalDate date) {
        LocalDate today = (date != null) ? date : LocalDate.now(ZoneOffset.UTC);

        // 1. Get user's active boards
        List<BoardMember> boardMembers = boardMemberRepository.findByUserIdWithActiveBoards(userId);
        if (boardMembers.isEmpty()) {
            return BoardTasksResponse.builder()
                    .boards(Collections.emptyList())
                    .totalPending(0)
                    .totalCompletedToday(0)
                    .build();
        }

        List<String> boardIds = boardMembers.stream()
                .map(bm -> bm.getBoard().getId())
                .toList();

        // 2. Fetch cross-board data
        List<ChecklistItem> pendingChecklists = checklistItemRepository
                .findByAssigneeIdAndBoardIdInAndNotCompleted(userId, boardIds);

        List<DailyChecklist> dailyChecklists = dailyChecklistRepository
                .findByAssigneeIdAndBoardIdInAndAssignedDate(userId, boardIds, today);

        List<Meeting> meetings = meetingRepository
                .findByBoardIdInAndMeetingDateBetween(boardIds, today, today);

        // 3. Fetch today's completed checklists for count
        LocalDateTime dayStart = today.atStartOfDay();
        LocalDateTime dayEnd = today.plusDays(1).atStartOfDay();
        List<ChecklistItem> completedToday = checklistItemRepository
                .findCompletedByAssigneeAndBoardIdsAndDateRange(userId, boardIds, dayStart, dayEnd);

        // 4. Group by board
        Map<String, Board> boardMap = boardMembers.stream()
                .collect(Collectors.toMap(bm -> bm.getBoard().getId(), BoardMember::getBoard, (a, b) -> a));

        Map<String, List<ChecklistItem>> pendingByBoard = pendingChecklists.stream()
                .collect(Collectors.groupingBy(ci -> ci.getTask().getBoard().getId()));

        Map<String, List<DailyChecklist>> dailyByBoard = dailyChecklists.stream()
                .collect(Collectors.groupingBy(dc -> dc.getBoard().getId()));

        Map<String, List<Meeting>> meetingsByBoard = meetings.stream()
                .collect(Collectors.groupingBy(m -> m.getBoard().getId()));

        Map<String, List<ChecklistItem>> completedByBoard = completedToday.stream()
                .collect(Collectors.groupingBy(ci -> ci.getTask().getBoard().getId()));

        int totalPending = 0;
        int totalCompletedToday = 0;

        List<BoardTasksResponse.BoardGroup> boardGroups = new ArrayList<>();
        for (String boardId : boardIds) {
            Board board = boardMap.get(boardId);
            if (board == null) continue;

            List<BoardTasksResponse.BoardItem> items = new ArrayList<>();

            // Add pending checklists
            List<ChecklistItem> boardPending = pendingByBoard.getOrDefault(boardId, Collections.emptyList());
            for (ChecklistItem ci : boardPending) {
                items.add(BoardTasksResponse.BoardItem.builder()
                        .type("CHECKLIST")
                        .checklistItemId(ci.getId())
                        .title(ci.getTitle())
                        .taskTitle(ci.getTask().getTitle())
                        .featureTitle(ci.getTask().getFeature().getTitle())
                        .featureColor(ci.getTask().getFeature().getColor())
                        .dueDate(ci.getDueDate())
                        .isCompleted(false)
                        .build());
            }

            // Add daily checklists
            List<DailyChecklist> boardDaily = dailyByBoard.getOrDefault(boardId, Collections.emptyList());
            for (DailyChecklist dc : boardDaily) {
                boolean isCompleted = dc.getChecklistItem() != null && dc.getChecklistItem().getIsCompleted();
                items.add(BoardTasksResponse.BoardItem.builder()
                        .type("DAILY_CHECKLIST")
                        .dailyChecklistId(dc.getId())
                        .title(dc.getTitle())
                        .isCompleted(isCompleted)
                        .build());
            }

            // Add meetings
            List<Meeting> boardMeetings = meetingsByBoard.getOrDefault(boardId, Collections.emptyList());
            for (Meeting m : boardMeetings) {
                items.add(BoardTasksResponse.BoardItem.builder()
                        .type("MEETING")
                        .meetingId(m.getId())
                        .title(m.getTitle())
                        .startTime(m.getStartTime())
                        .endTime(m.getEndTime())
                        .build());
            }

            // Skip boards with no items
            if (items.isEmpty()) continue;

            int pendingCount = boardPending.size() + (int) boardDaily.stream()
                    .filter(dc -> dc.getChecklistItem() == null || !dc.getChecklistItem().getIsCompleted())
                    .count();
            int completedTodayCount = completedByBoard.getOrDefault(boardId, Collections.emptyList()).size();

            totalPending += pendingCount;
            totalCompletedToday += completedTodayCount;

            boardGroups.add(BoardTasksResponse.BoardGroup.builder()
                    .boardId(boardId)
                    .boardName(board.getName())
                    .backgroundGradient(board.getBackgroundGradient())
                    .items(items)
                    .pendingCount(pendingCount)
                    .completedTodayCount(completedTodayCount)
                    .build());
        }

        return BoardTasksResponse.builder()
                .boards(boardGroups)
                .totalPending(totalPending)
                .totalCompletedToday(totalCompletedToday)
                .build();
    }

    // ==================== Cross-Domain Integration: Celebrations ====================

    public CelebrationsResponse getCelebrations(String userId, LocalDate date) {
        LocalDate today = (date != null) ? date : LocalDate.now(ZoneOffset.UTC);

        // 1. Get user's organizations
        List<OrganizationMember> orgMemberships = orgMemberRepository.findByUserIdWithOrganization(userId);
        if (orgMemberships.isEmpty()) {
            return CelebrationsResponse.builder()
                    .celebrations(Collections.emptyList())
                    .build();
        }

        List<CelebrationsResponse.CelebrationItem> celebrations = new ArrayList<>();

        for (OrganizationMember membership : orgMemberships) {
            Organization org = membership.getOrganization();
            if (org.isDeleted()) continue;

            // 2. Check anniversary settings
            Optional<OrgAnniversarySetting> settingOpt = orgAnniversarySettingRepository
                    .findByOrganizationId(org.getId());
            if (settingOpt.isEmpty()) continue;

            OrgAnniversarySetting settings = settingOpt.get();
            boolean birthdayEnabled = settings.getBirthdayEnabled();
            boolean hireEnabled = settings.getHireAnniversaryEnabled();
            if (!birthdayEnabled && !hireEnabled) continue;

            // 3. Get active members of the organization
            List<OrganizationMember> activeMembers = orgMemberRepository.findActiveMembers(
                    org.getId(), List.of(WorkStatus.ACTIVE, WorkStatus.ON_LEAVE));

            for (OrganizationMember member : activeMembers) {
                // Skip self
                if (member.getUser().getId().equals(userId)) continue;

                // Birthday check
                if (birthdayEnabled && member.getBirthDate() != null) {
                    LocalDate birthdayThisYear = getAnniversaryDateThisYear(member.getBirthDate(), today);
                    if (birthdayThisYear != null && birthdayThisYear.isEqual(today)) {
                        boolean alreadySent = orgCelebrationMessageRepository
                                .existsByTargetMemberIdAndAuthorIdAndAnniversaryTypeAndAnniversaryDate(
                                        member.getId(), userId, AnniversaryType.BIRTHDAY, today);

                        celebrations.add(CelebrationsResponse.CelebrationItem.builder()
                                .orgId(org.getId())
                                .orgName(org.getName())
                                .memberUserId(member.getUser().getId())
                                .memberName(member.getUser().getName())
                                .memberProfileImage(member.getUser().getProfileImage())
                                .type(AnniversaryType.BIRTHDAY.name())
                                .messageTemplate("\uD83C\uDF82 " + member.getUser().getName() + "님의 생일을 축하합니다!")
                                .canSendMessage(true)
                                .alreadySent(alreadySent)
                                .build());
                    }
                }

                // Hire anniversary check
                if (hireEnabled && member.getHireDate() != null) {
                    LocalDate hireAnniversary = getAnniversaryDateThisYear(member.getHireDate(), today);
                    if (hireAnniversary != null && hireAnniversary.isEqual(today)) {
                        int years = today.getYear() - member.getHireDate().getYear();
                        if (years <= 0) continue;

                        boolean alreadySent = orgCelebrationMessageRepository
                                .existsByTargetMemberIdAndAuthorIdAndAnniversaryTypeAndAnniversaryDate(
                                        member.getId(), userId, AnniversaryType.HIRE_ANNIVERSARY, today);

                        celebrations.add(CelebrationsResponse.CelebrationItem.builder()
                                .orgId(org.getId())
                                .orgName(org.getName())
                                .memberUserId(member.getUser().getId())
                                .memberName(member.getUser().getName())
                                .memberProfileImage(member.getUser().getProfileImage())
                                .type(AnniversaryType.HIRE_ANNIVERSARY.name())
                                .messageTemplate("\uD83C\uDF89 " + member.getUser().getName() + "님의 입사 " + years + "주년을 축하합니다!")
                                .canSendMessage(true)
                                .alreadySent(alreadySent)
                                .build());
                    }
                }
            }
        }

        return CelebrationsResponse.builder()
                .celebrations(celebrations)
                .build();
    }

    // ==================== Helper Methods ====================

    /**
     * Get the anniversary date for the current year, handling leap year for Feb 29.
     */
    private LocalDate getAnniversaryDateThisYear(LocalDate originalDate, LocalDate today) {
        int month = originalDate.getMonthValue();
        int day = originalDate.getDayOfMonth();
        int currentYear = today.getYear();

        if (month == 2 && day == 29 && !today.isLeapYear()) {
            return LocalDate.of(currentYear, 2, 28);
        }

        try {
            return LocalDate.of(currentYear, month, day);
        } catch (Exception e) {
            log.warn("Failed to calculate anniversary date for {} in year {}", originalDate, currentYear);
            return null;
        }
    }
}
