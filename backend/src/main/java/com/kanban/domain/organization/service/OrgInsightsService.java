package com.kanban.domain.organization.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.activity.ActivityLogRepository;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.organization.OrganizationMember;
import com.kanban.domain.organization.WorkStatus;
import com.kanban.domain.organization.dto.OrgBoardResourceResponse;
import com.kanban.domain.organization.dto.OrgInsightsSummaryResponse;
import com.kanban.domain.organization.dto.OrgMemberContributionResponse;
import com.kanban.domain.organization.dto.OrgMemberDetailResponse;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.task.TaskRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgInsightsService {

    private final OrganizationService organizationService;
    private final BoardRepository boardRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final ActivityLogRepository activityLogRepository;
    private final TaskRepository taskRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final FeatureRepository featureRepository;
    private final OrgMemberRepository orgMemberRepository;

    /**
     * Get insights summary for an organization.
     * Permission: All org members can view (MEMBER sees same summary)
     */
    public OrgInsightsSummaryResponse.Summary getSummary(String orgId, String userId, LocalDate startDate, LocalDate endDate) {
        // 1. Verify membership
        organizationService.getOrgMemberOrThrow(orgId, userId);

        // 2. Get org board IDs
        List<String> boardIds = boardRepository.findBoardIdsByOrgId(orgId);
        int totalMembers = orgMemberRepository.countActiveMembersByOrgId(orgId);

        if (boardIds.isEmpty()) {
            return buildEmptySummary(startDate, endDate, totalMembers, 0);
        }

        // 3. Calculate date ranges
        int days = (int) ChronoUnit.DAYS.between(startDate, endDate);
        LocalDate prevStart = startDate.minusDays(days);
        LocalDate prevEnd = endDate.minusDays(days);

        // Convert to datetime for activity_log queries
        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.plusDays(1).atStartOfDay();
        LocalDateTime prevStartDateTime = prevStart.atStartOfDay();
        LocalDateTime prevEndDateTime = prevEnd.plusDays(1).atStartOfDay();

        // 4. Aggregate metrics
        long totalMinutes = scheduleBlockRepository.sumMinutesByBoardIdsAndDateRange(boardIds, startDate, endDate);
        long prevMinutes = scheduleBlockRepository.sumMinutesByBoardIdsAndDateRange(boardIds, prevStart, prevEnd);
        long activeMembers = activityLogRepository.countDistinctUsersByBoardIdsAndDateRange(boardIds, startDateTime, endDateTime);
        long completedTasks = taskRepository.countCompletedByBoardIdsAndDateRange(boardIds, startDateTime, endDateTime);
        long activeBoards = activityLogRepository.countDistinctBoardsByBoardIdsAndDateRange(boardIds, startDateTime, endDateTime);
        int totalBoards = boardIds.size();

        // 5. Build summary (changePercentage is calculated inside the DTO)
        return OrgInsightsSummaryResponse.Summary.of(
                startDate, endDate, totalMinutes, prevMinutes,
                (int) activeMembers, totalMembers, completedTasks, activeBoards, totalBoards
        );
    }

    /**
     * Get member contributions.
     * Permission: OWNER/ADMIN sees all, MEMBER sees only self
     */
    public List<OrgMemberContributionResponse.MemberContribution> getMemberContributions(
            String orgId, String userId, LocalDate startDate, LocalDate endDate,
            String departmentId, String jobGroupId, String sortBy, String sortDir) {

        OrganizationMember requester = organizationService.getOrgMemberOrThrow(orgId, userId);
        List<String> boardIds = boardRepository.findBoardIdsByOrgId(orgId);
        if (boardIds.isEmpty()) return List.of();

        // Get members (filtered by department/jobGroup if provided)
        List<OrganizationMember> members;
        if (!requester.isAdminOrAbove()) {
            // MEMBER can only see self
            members = List.of(requester);
        } else {
            // OWNER/ADMIN sees all active members
            members = orgMemberRepository.findActiveMembers(orgId, List.of(WorkStatus.ACTIVE, WorkStatus.ON_LEAVE));
            // Apply filters
            if (departmentId != null) {
                members = members.stream()
                        .filter(m -> m.getDepartment() != null && m.getDepartment().getId().equals(departmentId))
                        .toList();
            }
            if (jobGroupId != null) {
                members = members.stream()
                        .filter(m -> m.getJobGroup() != null && m.getJobGroup().getId().equals(jobGroupId))
                        .toList();
            }
        }

        // Calculate date ranges for comparison period
        int days = (int) ChronoUnit.DAYS.between(startDate, endDate);
        LocalDate prevStart = startDate.minusDays(days);
        LocalDate prevEnd = endDate.minusDays(days);
        LocalDateTime startDT = startDate.atStartOfDay();
        LocalDateTime endDT = endDate.plusDays(1).atStartOfDay();

        // Get aggregated data
        // user x board minutes matrix for current period
        List<Object[]> currentUserBoardMinutes = scheduleBlockRepository.sumMinutesGroupByUserAndBoard(boardIds, startDate, endDate);
        // user x board minutes for previous period
        List<Object[]> prevUserBoardMinutes = scheduleBlockRepository.sumMinutesGroupByUserAndBoard(boardIds, prevStart, prevEnd);

        // Build map: userId -> { boardId -> minutes }
        Map<String, Map<String, Long>> currentMap = buildUserBoardMap(currentUserBoardMinutes);
        Map<String, Map<String, Long>> prevMap = buildUserBoardMap(prevUserBoardMinutes);

        // Get board names
        Map<String, String> boardNameMap = boardRepository.findByOrganizationId(orgId).stream()
                .collect(Collectors.toMap(Board::getId, Board::getName));

        // Build results
        List<OrgMemberContributionResponse.MemberContribution> results = new ArrayList<>();
        for (OrganizationMember member : members) {
            String mUserId = member.getUser().getId();
            Map<String, Long> userBoards = currentMap.getOrDefault(mUserId, Map.of());
            Map<String, Long> prevUserBoards = prevMap.getOrDefault(mUserId, Map.of());

            long totalMinutes = userBoards.values().stream().mapToLong(Long::longValue).sum();
            long prevTotalMinutes = prevUserBoards.values().stream().mapToLong(Long::longValue).sum();

            // Completed tasks (checklist items by this user)
            long completedTasks = checklistItemRepository.countCompletedByAssigneeAndBoardIds(
                    mUserId, boardIds, startDT, endDT);

            // Activity count
            long activityCount = activityLogRepository.countByUserAndBoardIdsAndDateRange(
                    mUserId, boardIds, startDT, endDT);

            // Board breakdown
            List<OrgMemberContributionResponse.BoardBreakdown> breakdown = userBoards.entrySet().stream()
                    .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                    .map(e -> OrgMemberContributionResponse.BoardBreakdown.builder()
                            .boardId(e.getKey())
                            .boardName(boardNameMap.getOrDefault(e.getKey(), "Unknown"))
                            .workMinutes(e.getValue())
                            .percentage(totalMinutes > 0 ? Math.round(e.getValue() * 1000.0 / totalMinutes) / 10.0 : 0)
                            .build())
                    .toList();

            // Primary board
            OrgMemberContributionResponse.PrimaryBoard primaryBoard = null;
            if (!breakdown.isEmpty()) {
                var top = breakdown.get(0);
                primaryBoard = OrgMemberContributionResponse.PrimaryBoard.builder()
                        .id(top.getBoardId()).name(top.getBoardName()).build();
            }

            // Use the static factory method that auto-calculates changePercentage
            results.add(OrgMemberContributionResponse.MemberContribution.of(
                    member, totalMinutes, prevTotalMinutes,
                    completedTasks, activityCount, primaryBoard, breakdown));
        }

        // Sort
        Comparator<OrgMemberContributionResponse.MemberContribution> comparator = switch (sortBy != null ? sortBy : "work_minutes") {
            case "completed_tasks" -> Comparator.comparingLong(OrgMemberContributionResponse.MemberContribution::getCompletedTasks);
            case "activity_count" -> Comparator.comparingLong(OrgMemberContributionResponse.MemberContribution::getActivityCount);
            default -> Comparator.comparingLong(OrgMemberContributionResponse.MemberContribution::getTotalWorkMinutes);
        };
        if ("asc".equalsIgnoreCase(sortDir)) {
            results.sort(comparator);
        } else {
            results.sort(comparator.reversed());
        }

        return results;
    }

    /**
     * Get detailed contribution for a single member.
     * Permission: OWNER/ADMIN can view any member, MEMBER can only view self
     */
    public OrgMemberDetailResponse.Detail getMemberDetail(
            String orgId, String userId, String memberId, LocalDate startDate, LocalDate endDate) {

        OrganizationMember requester = organizationService.getOrgMemberOrThrow(orgId, userId);
        OrganizationMember target = orgMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        // MEMBER can only view self
        if (!requester.isAdminOrAbove() && !requester.getId().equals(memberId)) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }

        List<String> boardIds = boardRepository.findBoardIdsByOrgId(orgId);
        if (boardIds.isEmpty()) {
            return buildEmptyMemberDetail(target);
        }

        String targetUserId = target.getUser().getId();
        LocalDateTime startDT = startDate.atStartOfDay();
        LocalDateTime endDT = endDate.plusDays(1).atStartOfDay();

        // Get user x board minutes
        List<Object[]> userBoardMinutes = scheduleBlockRepository.sumMinutesGroupByUserAndBoard(boardIds, startDate, endDate);
        Map<String, Long> userBoards = new HashMap<>();
        for (Object[] row : userBoardMinutes) {
            if (targetUserId.equals(row[0])) {
                userBoards.put((String) row[1], ((Number) row[2]).longValue());
            }
        }

        long totalMinutes = userBoards.values().stream().mapToLong(Long::longValue).sum();
        long completedTasks = checklistItemRepository.countCompletedByAssigneeAndBoardIds(targetUserId, boardIds, startDT, endDT);
        long activityCount = activityLogRepository.countByUserAndBoardIdsAndDateRange(targetUserId, boardIds, startDT, endDT);

        // Board details with top features
        Map<String, String> boardNameMap = boardRepository.findByOrganizationId(orgId).stream()
                .collect(Collectors.toMap(Board::getId, Board::getName));

        List<OrgMemberDetailResponse.BoardDetail> boardDetails = userBoards.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .map(entry -> {
                    String boardId = entry.getKey();
                    long boardCompletedTasks = checklistItemRepository.countCompletedByAssigneeAndBoardIds(
                            targetUserId, List.of(boardId), startDT, endDT);

                    // Top features - Get features for this board, sorted by most tasks
                    List<Feature> features = featureRepository.findByBoardIdOrderByPositionAsc(boardId);
                    List<OrgMemberDetailResponse.TopFeature> topFeatures = features.stream()
                            .filter(f -> f.getTotalTasks() != null && f.getTotalTasks() > 0)
                            .sorted(Comparator.comparingInt(Feature::getTotalTasks).reversed())
                            .limit(3)
                            .map(f -> OrgMemberDetailResponse.TopFeature.builder()
                                    .id(f.getId())
                                    .title(f.getTitle())
                                    .workMinutes(0L) // Simplified - we don't track per-feature time blocks
                                    .build())
                            .toList();

                    return OrgMemberDetailResponse.BoardDetail.builder()
                            .boardId(boardId)
                            .boardName(boardNameMap.getOrDefault(boardId, "Unknown"))
                            .workMinutes(entry.getValue())
                            .completedTasks(boardCompletedTasks)
                            .topFeatures(topFeatures)
                            .build();
                })
                .toList();

        // Weekly trend
        List<Object[]> dailyMinutes = scheduleBlockRepository.sumMinutesGroupByUserAndDate(boardIds, targetUserId, startDate, endDate);
        List<OrgMemberDetailResponse.WeeklyTrend> weeklyTrend = aggregateToWeeklyTrend(dailyMinutes);

        return OrgMemberDetailResponse.Detail.of(
                target, totalMinutes, completedTasks, activityCount, boardDetails, weeklyTrend
        );
    }

    /**
     * Get board resource overview.
     * Permission: All org members can view
     */
    public OrgBoardResourceResponse.ListResponse getBoardResources(
            String orgId, String userId, LocalDate startDate, LocalDate endDate, String sortBy) {

        organizationService.getOrgMemberOrThrow(orgId, userId);

        List<Board> boards = boardRepository.findByOrganizationId(orgId);
        List<String> boardIds = boards.stream().map(Board::getId).toList();
        if (boardIds.isEmpty()) {
            return OrgBoardResourceResponse.ListResponse.of(List.of(), 0, List.of());
        }

        LocalDateTime startDT = startDate.atStartOfDay();
        LocalDateTime endDT = endDate.plusDays(1).atStartOfDay();

        // Get all user x board minutes
        List<Object[]> userBoardMinutes = scheduleBlockRepository.sumMinutesGroupByUserAndBoard(boardIds, startDate, endDate);

        // Build boardId -> { userId -> minutes }
        Map<String, Map<String, Long>> boardUserMap = new HashMap<>();
        for (Object[] row : userBoardMinutes) {
            String usrId = (String) row[0];
            String brdId = (String) row[1];
            long minutes = ((Number) row[2]).longValue();
            boardUserMap.computeIfAbsent(brdId, k -> new HashMap<>()).put(usrId, minutes);
        }

        long totalOrgMinutes = boardUserMap.values().stream()
                .flatMap(m -> m.values().stream())
                .mapToLong(Long::longValue).sum();

        // Get member names
        Map<String, OrganizationMember> memberByUserId = orgMemberRepository
                .findActiveMembers(orgId, List.of(WorkStatus.ACTIVE, WorkStatus.ON_LEAVE))
                .stream().collect(Collectors.toMap(m -> m.getUser().getId(), m -> m, (a, b) -> a));

        // Batch queries (N+1 방지)
        Map<String, Long> boardCompletedTasksMap = taskRepository.countCompletedGroupByBoardAndDateRange(boardIds, startDT, endDT)
                .stream().collect(Collectors.toMap(r -> (String) r[0], r -> ((Number) r[1]).longValue()));

        Map<String, Double> boardProgressMap = featureRepository.findAvgProgressByBoardIds(boardIds)
                .stream().collect(Collectors.toMap(r -> (String) r[0], r -> ((Number) r[1]).doubleValue()));

        List<Object[]> allBoardDailyMinutes = scheduleBlockRepository.sumMinutesGroupByBoardAndDate(boardIds, startDate, endDate);
        Map<String, String> boardNameMap = boards.stream()
                .collect(Collectors.toMap(Board::getId, Board::getName));

        // Pre-group daily minutes by board for per-board weekly trend
        Map<String, List<Object[]>> dailyMinutesByBoard = allBoardDailyMinutes.stream()
                .collect(Collectors.groupingBy(r -> (String) r[0]));

        // Build board resources
        List<OrgBoardResourceResponse.BoardResource> boardResources = boards.stream().map(board -> {
            String boardId = board.getId();
            Map<String, Long> users = boardUserMap.getOrDefault(boardId, Map.of());
            long boardMinutes = users.values().stream().mapToLong(Long::longValue).sum();

            long boardCompletedTasks = boardCompletedTasksMap.getOrDefault(boardId, 0L);
            double featureProgress = boardProgressMap.getOrDefault(boardId, 0.0);

            // Top 3 contributors
            List<OrgBoardResourceResponse.TopContributor> topContributors = users.entrySet().stream()
                    .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                    .limit(3)
                    .map(e -> {
                        OrganizationMember mem = memberByUserId.get(e.getKey());
                        return OrgBoardResourceResponse.TopContributor.builder()
                                .memberId(mem != null ? mem.getId() : e.getKey())
                                .name(mem != null ? mem.getUser().getName() : "Unknown")
                                .profileImage(mem != null ? mem.getUser().getProfileImage() : null)
                                .workMinutes(e.getValue())
                                .percentage(boardMinutes > 0 ? Math.round(e.getValue() * 1000.0 / boardMinutes) / 10.0 : 0)
                                .build();
                    })
                    .toList();

            // Board weekly trend (from pre-fetched data)
            List<Object[]> boardDailyMinutes = dailyMinutesByBoard.getOrDefault(boardId, List.of());
            List<OrgBoardResourceResponse.WeeklyTrend> weeklyTrend = aggregateBoardToWeeklyTrend(boardDailyMinutes);

            return OrgBoardResourceResponse.BoardResource.builder()
                    .board(OrgBoardResourceResponse.BoardInfo.builder()
                            .id(boardId)
                            .name(board.getName())
                            .ownerName(board.getOwner() != null ? board.getOwner().getName() : "Unknown")
                            .build())
                    .totalWorkMinutes(boardMinutes)
                    .orgSharePercentage(totalOrgMinutes > 0 ? Math.round(boardMinutes * 1000.0 / totalOrgMinutes) / 10.0 : 0)
                    .contributorCount(users.size())
                    .completedTasks(boardCompletedTasks)
                    .featureProgress(Math.round(featureProgress * 10.0) / 10.0)
                    .topContributors(topContributors)
                    .weeklyTrend(weeklyTrend)
                    .build();
        }).toList();

        // Sort
        List<OrgBoardResourceResponse.BoardResource> sorted = new ArrayList<>(boardResources);
        Comparator<OrgBoardResourceResponse.BoardResource> comparator = switch (sortBy != null ? sortBy : "work_minutes") {
            case "contributor_count" -> Comparator.comparingInt(OrgBoardResourceResponse.BoardResource::getContributorCount);
            case "completed_tasks" -> Comparator.comparingLong(OrgBoardResourceResponse.BoardResource::getCompletedTasks);
            default -> Comparator.comparingLong(OrgBoardResourceResponse.BoardResource::getTotalWorkMinutes);
        };
        sorted.sort(comparator.reversed());

        // Build weekly board trend for resource distribution
        List<OrgBoardResourceResponse.WeeklyBoardTrend> weeklyBoardTrend = aggregateToWeeklyBoardTrend(allBoardDailyMinutes, boardNameMap);

        return OrgBoardResourceResponse.ListResponse.of(sorted, totalOrgMinutes, weeklyBoardTrend);
    }

    // ─── Helper Methods ───

    private Map<String, Map<String, Long>> buildUserBoardMap(List<Object[]> rows) {
        Map<String, Map<String, Long>> map = new HashMap<>();
        for (Object[] row : rows) {
            String usrId = (String) row[0];
            String brdId = (String) row[1];
            long minutes = ((Number) row[2]).longValue();
            map.computeIfAbsent(usrId, k -> new HashMap<>()).put(brdId, minutes);
        }
        return map;
    }

    private List<OrgMemberDetailResponse.WeeklyTrend> aggregateToWeeklyTrend(List<Object[]> dailyMinutes) {
        // Group daily data into weeks (Monday-based)
        Map<LocalDate, Long> weekMap = new TreeMap<>();
        for (Object[] row : dailyMinutes) {
            LocalDate date = (LocalDate) row[1];
            long minutes = ((Number) row[2]).longValue();
            // Get Monday of the week
            LocalDate weekStart = date.with(java.time.DayOfWeek.MONDAY);
            weekMap.merge(weekStart, minutes, Long::sum);
        }

        return weekMap.entrySet().stream()
                .map(e -> OrgMemberDetailResponse.WeeklyTrend.builder()
                        .weekStart(e.getKey())
                        .workMinutes(e.getValue())
                        .completedTasks(0) // Simplified - would need per-week completed tasks query
                        .build())
                .toList();
    }

    private List<OrgBoardResourceResponse.WeeklyTrend> aggregateBoardToWeeklyTrend(List<Object[]> dailyMinutes) {
        Map<LocalDate, Long> weekMap = new TreeMap<>();
        for (Object[] row : dailyMinutes) {
            LocalDate date = (LocalDate) row[1];
            long minutes = ((Number) row[2]).longValue();
            LocalDate weekStart = date.with(java.time.DayOfWeek.MONDAY);
            weekMap.merge(weekStart, minutes, Long::sum);
        }
        return weekMap.entrySet().stream()
                .map(e -> OrgBoardResourceResponse.WeeklyTrend.builder()
                        .weekStart(e.getKey()).workMinutes(e.getValue()).build())
                .toList();
    }

    private List<OrgBoardResourceResponse.WeeklyBoardTrend> aggregateToWeeklyBoardTrend(
            List<Object[]> dailyMinutes, Map<String, String> boardNameMap) {
        // Group: weekStart -> boardId -> minutes
        Map<LocalDate, Map<String, Long>> weekBoardMap = new TreeMap<>();
        for (Object[] row : dailyMinutes) {
            String boardId = (String) row[0];
            LocalDate date = (LocalDate) row[1];
            long minutes = ((Number) row[2]).longValue();
            LocalDate weekStart = date.with(java.time.DayOfWeek.MONDAY);
            weekBoardMap.computeIfAbsent(weekStart, k -> new HashMap<>())
                    .merge(boardId, minutes, Long::sum);
        }

        return weekBoardMap.entrySet().stream()
                .map(weekEntry -> {
                    List<OrgBoardResourceResponse.BoardWeekMinutes> boardMinutesList = weekEntry.getValue().entrySet().stream()
                            .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                            .map(bEntry -> OrgBoardResourceResponse.BoardWeekMinutes.builder()
                                    .boardId(bEntry.getKey())
                                    .boardName(boardNameMap.getOrDefault(bEntry.getKey(), "Unknown"))
                                    .workMinutes(bEntry.getValue())
                                    .build())
                            .toList();
                    return OrgBoardResourceResponse.WeeklyBoardTrend.builder()
                            .weekStart(weekEntry.getKey())
                            .boards(boardMinutesList)
                            .build();
                })
                .toList();
    }

    private OrgInsightsSummaryResponse.Summary buildEmptySummary(LocalDate start, LocalDate end, int totalMembers, int totalBoards) {
        return OrgInsightsSummaryResponse.Summary.of(start, end, 0, 0, 0, totalMembers, 0, 0, totalBoards);
    }

    private OrgMemberDetailResponse.Detail buildEmptyMemberDetail(OrganizationMember member) {
        return OrgMemberDetailResponse.Detail.of(
                member, 0, 0, 0, List.of(), List.of()
        );
    }
}
