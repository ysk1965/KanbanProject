package com.kanban.domain.statistics.service;

import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneAllocation;
import com.kanban.domain.milestone.MilestoneAllocationRepository;
import com.kanban.domain.milestone.MilestoneFeatureRepository;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.schedule.ScheduleBlock;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.statistics.dto.ManagementResponse;
import com.kanban.domain.statistics.dto.ManagementResponse.*;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ManagementService {

    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final MilestoneRepository milestoneRepository;
    private final MilestoneAllocationRepository milestoneAllocationRepository;
    private final MilestoneFeatureRepository milestoneFeatureRepository;
    private final FeatureRepository featureRepository;
    private final TaskRepository taskRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final BlockRepository blockRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;

    private static final double DEFAULT_HOURS_PER_DAY = 8.0;

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE;

    // ==================== Main Method ====================

    public ManagementStatistics getManagementStatistics(
            String boardId,
            String userId,
            String milestoneId,
            int stagnantTaskDays,
            int stuckChecklistDays
    ) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // 모든 데이터 로드
        List<Milestone> milestones = milestoneRepository.findByBoardIdOrderByStartDateAsc(boardId);
        List<Feature> allFeatures = featureRepository.findByBoardIdOrderByPositionAsc(boardId);
        List<Task> allTasks = taskRepository.findByBoardIdOrderByPositionAsc(boardId);
        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
        List<Block> blocks = blockRepository.findByBoardIdOrderByPositionAsc(boardId);

        // 특정 마일스톤 필터링 - 마일스톤뿐 아니라 Feature, Task도 해당 마일스톤 기준으로 필터링
        Set<String> filteredFeatureIds = null;
        if (milestoneId != null && !milestoneId.isEmpty()) {
            milestones = milestones.stream()
                    .filter(m -> m.getId().equals(milestoneId))
                    .collect(Collectors.toList());

            // 해당 마일스톤에 속한 Feature ID들
            filteredFeatureIds = new HashSet<>(milestoneFeatureRepository.findFeatureIdsByMilestoneId(milestoneId));

            // Feature, Task 필터링
            final Set<String> featureIdSet = filteredFeatureIds;
            allFeatures = allFeatures.stream()
                    .filter(f -> featureIdSet.contains(f.getId()))
                    .collect(Collectors.toList());
            allTasks = allTasks.stream()
                    .filter(t -> featureIdSet.contains(t.getFeature().getId()))
                    .collect(Collectors.toList());
        }

        // 모든 ScheduleBlock 로드 (시간 계산용)
        List<ScheduleBlock> allScheduleBlocks = scheduleBlockRepository.findAllWithChecklistByBoardId(boardId);
        Map<String, Long> taskActualMinutes = calculateTaskActualMinutes(allScheduleBlocks);

        // 1. 마일스톤 헬스 계산
        List<MilestoneHealth> milestoneHealthList = calculateMilestoneHealth(
                milestones, allFeatures, allTasks, boardId, allScheduleBlocks, taskActualMinutes
        );

        // 2. 팀원별 생산성 계산
        List<MemberProductivity> teamProductivity = calculateTeamProductivity(
                members, allTasks, boardId, milestoneId, stuckChecklistDays, allScheduleBlocks, taskActualMinutes
        );

        // 3. 지연 항목 식별
        DelayedItems delayedItems = identifyDelayedItems(
                boardId, allFeatures, allTasks, blocks, stagnantTaskDays, stuckChecklistDays
        );

        // 4. 요약 통계 계산
        ManagementSummary summary = calculateSummary(milestoneHealthList, teamProductivity, delayedItems);

        // 5. 설정 정보
        ManagementSettings settings = ManagementSettings.builder()
                .stagnant_task_days_threshold(stagnantTaskDays)
                .stuck_checklist_days_threshold(stuckChecklistDays)
                .build();

        return ManagementStatistics.builder()
                .milestone_health(milestoneHealthList)
                .team_productivity(teamProductivity)
                .delayed_items(delayedItems)
                .summary(summary)
                .settings(settings)
                .build();
    }

    // ==================== Milestone Health ====================

    private List<MilestoneHealth> calculateMilestoneHealth(
            List<Milestone> milestones,
            List<Feature> allFeatures,
            List<Task> allTasks,
            String boardId,
            List<ScheduleBlock> allScheduleBlocks,
            Map<String, Long> taskActualMinutes
    ) {
        List<MilestoneHealth> healthList = new ArrayList<>();

        for (Milestone milestone : milestones) {
            // 마일스톤에 속한 Feature ID 조회
            List<String> featureIds = milestoneFeatureRepository.findFeatureIdsByMilestoneId(milestone.getId());
            if (featureIds.isEmpty()) {
                continue;
            }

            // 해당 Feature들의 Task 필터링
            Set<String> featureIdSet = new HashSet<>(featureIds);
            List<Feature> milestoneFeatures = allFeatures.stream()
                    .filter(f -> featureIdSet.contains(f.getId()))
                    .collect(Collectors.toList());
            List<Task> milestoneTasks = allTasks.stream()
                    .filter(t -> featureIdSet.contains(t.getFeature().getId()))
                    .collect(Collectors.toList());

            // Task 통계
            int totalTasks = milestoneTasks.size();
            int completedTasks = (int) milestoneTasks.stream().filter(Task::getIsCompleted).count();
            int remainingTasks = totalTasks - completedTasks;

            // 시간 기반 통계 계산
            int estimatedTotalMinutes = milestoneTasks.stream()
                    .mapToInt(t -> t.getEstimatedMinutes() != null ? t.getEstimatedMinutes() : 0)
                    .sum();
            int completedEstimatedMinutes = milestoneTasks.stream()
                    .filter(Task::getIsCompleted)
                    .mapToInt(t -> t.getEstimatedMinutes() != null ? t.getEstimatedMinutes() : 0)
                    .sum();
            int remainingEstimatedMinutes = estimatedTotalMinutes - completedEstimatedMinutes;

            // 실제 소요 시간 계산
            int actualTotalMinutes = milestoneTasks.stream()
                    .mapToInt(t -> taskActualMinutes.getOrDefault(t.getId(), 0L).intValue())
                    .sum();

            // 시간 기반 진행률 (예상 시간이 있으면 시간 기준, 없으면 Task 수 기준)
            double progressPercentage;
            if (estimatedTotalMinutes > 0) {
                progressPercentage = completedEstimatedMinutes * 100.0 / estimatedTotalMinutes;
            } else {
                progressPercentage = totalTasks > 0 ? (completedTasks * 100.0 / totalTasks) : 0;
            }

            // 마일스톤 기간 계산
            LocalDate startDate = milestone.getStartDate();
            LocalDate endDate = milestone.getEndDate();
            long totalMilestoneDays = Math.max(1, ChronoUnit.DAYS.between(startDate, endDate));
            long elapsedDays = Math.max(1, ChronoUnit.DAYS.between(startDate, LocalDate.now()));
            long daysRemaining = Math.max(0, ChronoUnit.DAYS.between(LocalDate.now(), endDate));

            // 필요 속도 = 전체 예상 시간 / 마일스톤 총 일수
            double requiredMinutesPerDay = estimatedTotalMinutes / (double) totalMilestoneDays;

            // 현재 속도 = 완료된 Task의 예상 시간 합 / 경과 일수
            double currentMinutesPerDay = completedEstimatedMinutes / (double) elapsedDays;

            // Task 기반 속도
            double averageVelocity = calculateAverageVelocity(boardId, 7);
            double requiredVelocity = daysRemaining > 0 ? (double) remainingTasks / daysRemaining : remainingTasks;

            // 예상 완료일 (현재 속도 기준)
            LocalDate estimatedCompletion;
            if (remainingEstimatedMinutes > 0 && currentMinutesPerDay > 0) {
                int daysNeeded = (int) Math.ceil(remainingEstimatedMinutes / currentMinutesPerDay);
                estimatedCompletion = LocalDate.now().plusDays(daysNeeded);
            } else if (remainingEstimatedMinutes == 0) {
                estimatedCompletion = LocalDate.now(); // 이미 완료
            } else {
                estimatedCompletion = null; // 예측 불가 (아직 완료된 Task 없음)
            }

            // 효율성 계산 (실제/예상, 낮을수록 좋음)
            Double timeEfficiency = null;
            if (completedEstimatedMinutes > 0 && actualTotalMinutes > 0) {
                timeEfficiency = Math.round((actualTotalMinutes * 100.0 / completedEstimatedMinutes) * 10) / 10.0;
            }

            // 상태 판정 (시간 기반)
            String status = determineMilestoneStatusWithTime(
                    endDate, estimatedCompletion, progressPercentage, startDate,
                    remainingEstimatedMinutes, currentMinutesPerDay
            );

            // 마감 초과일 계산
            int daysOverdue = 0;
            if (LocalDate.now().isAfter(endDate)) {
                daysOverdue = (int) ChronoUnit.DAYS.between(endDate, LocalDate.now());
            }

            // 해당 마일스톤 Task들의 ScheduleBlock 필터링
            Set<String> milestoneTaskIds = milestoneTasks.stream()
                    .map(Task::getId)
                    .collect(Collectors.toSet());
            List<ScheduleBlock> milestoneScheduleBlocks = allScheduleBlocks.stream()
                    .filter(sb -> sb.getChecklistItem() != null &&
                            sb.getChecklistItem().getTask() != null &&
                            milestoneTaskIds.contains(sb.getChecklistItem().getTask().getId()))
                    .collect(Collectors.toList());

            // 번다운 차트 데이터 (시간 포함 - TimeBlock 기반)
            List<BurndownPoint> burndown = generateBurndownDataWithTime(
                    milestone.getStartDate(), endDate, totalTasks, milestoneTasks,
                    estimatedTotalMinutes, milestoneScheduleBlocks
            );

            // Feature 요약
            int completedFeatures = (int) milestoneFeatures.stream()
                    .filter(f -> f.getCompletedTasks() >= f.getTotalTasks() && f.getTotalTasks() > 0)
                    .count();
            int atRiskFeatures = (int) milestoneFeatures.stream()
                    .filter(f -> f.getDueDate() != null && f.getDueDate().isBefore(LocalDate.now()) &&
                            f.getCompletedTasks() < f.getTotalTasks())
                    .count();

            // Batch load: 마일스톤 Task들의 ChecklistItem (N+1 방지)
            List<ChecklistItem> allMilestoneChecklistItems = milestoneTaskIds.isEmpty() ?
                    Collections.emptyList() : checklistItemRepository.findByTaskIdIn(new ArrayList<>(milestoneTaskIds));
            Map<String, List<ChecklistItem>> milestoneChecklistsByTaskId = allMilestoneChecklistItems.stream()
                    .collect(Collectors.groupingBy(ci -> ci.getTask().getId()));

            // Task 목록 생성 (ChecklistItem 담당자 수집)
            List<MilestoneTask> milestonTaskList = milestoneTasks.stream()
                    .map(t -> {
                        // ChecklistItem들의 담당자 수집 (중복 제거) - 배치 로드 사용
                        List<ChecklistItem> checklistItems = milestoneChecklistsByTaskId.getOrDefault(t.getId(), Collections.emptyList());
                        List<MemberInfo> assignees = checklistItems.stream()
                                .filter(c -> c.getAssignee() != null)
                                .map(c -> c.getAssignee())
                                .distinct()
                                .map(user -> MemberInfo.builder()
                                        .id(user.getId())
                                        .name(user.getName())
                                        .profile_image(user.getProfileImage())
                                        .build())
                                .collect(Collectors.toList());

                        return MilestoneTask.builder()
                                .task_id(t.getId())
                                .task_title(t.getTitle())
                                .feature_id(t.getFeature().getId())
                                .feature_title(t.getFeature().getTitle())
                                .feature_color(t.getFeature().getColor())
                                .assignees(assignees)
                                .current_block(t.getBlock().getName())
                                .is_completed(t.getIsCompleted())
                                .estimated_minutes(t.getEstimatedMinutes())
                                .actual_minutes(taskActualMinutes.getOrDefault(t.getId(), 0L).intValue())
                                .start_date(t.getStartDate() != null ? t.getStartDate().format(DATE_FORMATTER) : null)
                                .due_date(t.getDueDate() != null ? t.getDueDate().format(DATE_FORMATTER) : null)
                                .build();
                    })
                    .collect(Collectors.toList());

            MilestoneHealth health = MilestoneHealth.builder()
                    .milestone(MilestoneInfo.builder()
                            .id(milestone.getId())
                            .title(milestone.getTitle())
                            .description(milestone.getDescription())
                            .start_date(milestone.getStartDate().format(DATE_FORMATTER))
                            .end_date(endDate.format(DATE_FORMATTER))
                            .build())
                    .progress_percentage(Math.round(progressPercentage * 10) / 10.0)
                    .estimated_completion_date(estimatedCompletion != null ?
                            estimatedCompletion.format(DATE_FORMATTER) : null)
                    .status(status)
                    .days_remaining((int) daysRemaining)
                    .days_overdue(daysOverdue)
                    .velocity(VelocityInfo.builder()
                            .average_tasks_per_day(Math.round(averageVelocity * 100) / 100.0)
                            .tasks_remaining(remainingTasks)
                            .tasks_completed(completedTasks)
                            .tasks_total(totalTasks)
                            .required_velocity(Math.round(requiredVelocity * 100) / 100.0)
                            // 시간 기반 메트릭
                            .estimated_total_minutes(estimatedTotalMinutes)
                            .actual_total_minutes(actualTotalMinutes)
                            .remaining_estimated_minutes(remainingEstimatedMinutes)
                            .average_minutes_per_day(Math.round(currentMinutesPerDay * 100) / 100.0) // 현재 속도 (완료된 예상시간/경과일)
                            .required_minutes_per_day(Math.round(requiredMinutesPerDay * 100) / 100.0) // 필요 속도 (전체 예상시간/총 일수)
                            .time_efficiency(timeEfficiency)
                            .build())
                    .burndown(burndown)
                    .feature_summary(FeatureSummary.builder()
                            .total_features(milestoneFeatures.size())
                            .completed_features(completedFeatures)
                            .at_risk_features(atRiskFeatures)
                            .build())
                    .tasks(milestonTaskList)
                    .build();

            healthList.add(health);
        }

        return healthList;
    }

    /**
     * Task별 실제 작업 시간 계산 (ChecklistItem → ScheduleBlock)
     */
    private Map<String, Long> calculateTaskActualMinutes(List<ScheduleBlock> scheduleBlocks) {
        Map<String, Long> taskMinutes = new HashMap<>();

        for (ScheduleBlock block : scheduleBlocks) {
            if (block.getChecklistItem() != null && block.getChecklistItem().getTask() != null) {
                String taskId = block.getChecklistItem().getTask().getId();
                long minutes = calculateBlockMinutes(block);
                taskMinutes.merge(taskId, minutes, Long::sum);
            }
        }

        return taskMinutes;
    }

    /**
     * ScheduleBlock의 시간 계산 (분)
     */
    private long calculateBlockMinutes(ScheduleBlock block) {
        if (block.getStartTime() == null || block.getEndTime() == null) {
            return 0;
        }
        return Duration.between(block.getStartTime(), block.getEndTime()).toMinutes();
    }

    /**
     * 최근 N일간 평균 작업 시간 (분/일)
     */
    private double calculateAverageMinutesPerDay(String boardId, int days, List<ScheduleBlock> allBlocks) {
        LocalDate startDate = LocalDate.now().minusDays(days);
        LocalDate endDate = LocalDate.now();

        long totalMinutes = allBlocks.stream()
                .filter(b -> !b.getScheduledDate().isBefore(startDate) && !b.getScheduledDate().isAfter(endDate))
                .mapToLong(this::calculateBlockMinutes)
                .sum();

        return totalMinutes / (double) days;
    }

    private double calculateAverageVelocity(String boardId, int days) {
        LocalDateTime endDate = LocalDateTime.now(ZoneOffset.UTC);
        LocalDateTime startDate = endDate.minusDays(days);

        List<Task> completedTasks = taskRepository.findCompletedTasksBetween(boardId, startDate, endDate);
        return completedTasks.size() / (double) days;
    }

    private LocalDate calculateEstimatedCompletionDate(int remainingTasks, double averageVelocity) {
        if (remainingTasks == 0) {
            return LocalDate.now();
        }
        if (averageVelocity <= 0) {
            return null; // 예측 불가
        }
        int daysNeeded = (int) Math.ceil(remainingTasks / averageVelocity);
        return LocalDate.now().plusDays(daysNeeded);
    }

    /**
     * 시간 기반 마일스톤 상태 판정
     */
    private String determineMilestoneStatusWithTime(
            LocalDate endDate,
            LocalDate estimatedCompletion,
            double progressPercentage,
            LocalDate startDate,
            int remainingEstimatedMinutes,
            double averageMinutesPerDay
    ) {
        // 이미 100% 완료
        if (progressPercentage >= 100) {
            return "ON_TRACK";
        }

        // 마감일 지남
        if (LocalDate.now().isAfter(endDate)) {
            return "OVERDUE";
        }

        // 예상 완료일이 마감일 이후
        if (estimatedCompletion != null && estimatedCompletion.isAfter(endDate)) {
            return "AT_RISK";
        }

        // 기대 진행률 대비 현재 진행률 비교
        long totalDays = ChronoUnit.DAYS.between(startDate, endDate);
        long elapsedDays = ChronoUnit.DAYS.between(startDate, LocalDate.now());
        double expectedProgress = totalDays > 0 ? (elapsedDays * 100.0 / totalDays) : 0;

        if (progressPercentage < expectedProgress * 0.8) {
            return "SLOW";
        }

        return "ON_TRACK";
    }

    /**
     * 시간 기반 번다운 차트 데이터 생성 (마일스톤 전체 기간)
     * TimeBlock(ScheduleBlock) 데이터를 기반으로 실제 작업 시간 반영
     */
    private List<BurndownPoint> generateBurndownDataWithTime(
            LocalDate startDate,
            LocalDate endDate,
            int totalTasks,
            List<Task> tasks,
            int estimatedTotalMinutes,
            List<ScheduleBlock> scheduleBlocks
    ) {
        List<BurndownPoint> burndown = new ArrayList<>();
        LocalDate today = LocalDate.now();
        long totalDays = ChronoUnit.DAYS.between(startDate, endDate);

        // 날짜별 실제 작업 시간 계산 (ScheduleBlock 기반)
        Map<LocalDate, Long> dailyActualMinutes = scheduleBlocks.stream()
                .collect(Collectors.groupingBy(
                        ScheduleBlock::getScheduledDate,
                        Collectors.summingLong(this::calculateBlockMinutes)
                ));

        // 현재 남은 예상 시간 (오늘 기준) - 미래 날짜에 사용
        int currentRemainingMinutes = tasks.stream()
                .filter(t -> !t.getIsCompleted())
                .mapToInt(t -> t.getEstimatedMinutes() != null ? t.getEstimatedMinutes() : 0)
                .sum();
        int currentRemainingTasks = (int) tasks.stream().filter(t -> !t.getIsCompleted()).count();

        // 시작일부터 마감일까지 전체 기간 데이터 생성
        LocalDate currentDate = startDate;
        long cumulativeActualMinutes = 0; // 누적 실제 작업 시간

        while (!currentDate.isAfter(endDate)) {
            long dayIndex = ChronoUnit.DAYS.between(startDate, currentDate);

            // 이상적 남은 Task (선형 감소)
            double idealRemaining = totalDays > 0 ?
                    totalTasks * (1 - (double) dayIndex / totalDays) : 0;

            // 이상적 남은 시간 (분, 선형 감소)
            double idealRemainingMinutes = totalDays > 0 ?
                    estimatedTotalMinutes * (1 - (double) dayIndex / totalDays) : 0;

            int actualRemaining;
            int actualRemainingMinutes;

            if (!currentDate.isAfter(today)) {
                // 과거 또는 오늘: 실제 TimeBlock 데이터 기반
                LocalDate finalCurrentDate = currentDate;

                // Task 완료 기준 남은 Task 수
                List<Task> remainingTasksAtDate = tasks.stream()
                        .filter(t -> !t.getIsCompleted() ||
                                (t.getCompletedAt() != null &&
                                 t.getCompletedAt().toLocalDate().isAfter(finalCurrentDate)))
                        .collect(Collectors.toList());
                actualRemaining = remainingTasksAtDate.size();

                // 해당 날짜까지 누적 실제 작업 시간
                cumulativeActualMinutes += dailyActualMinutes.getOrDefault(currentDate, 0L);

                // 남은 시간 = 전체 예상 시간 - 누적 실제 작업 시간
                actualRemainingMinutes = (int) Math.max(0, estimatedTotalMinutes - cumulativeActualMinutes);
            } else {
                // 미래: 현재 상태 유지 (아직 모르는 값)
                actualRemaining = currentRemainingTasks;
                actualRemainingMinutes = (int) Math.max(0, estimatedTotalMinutes - cumulativeActualMinutes);
            }

            burndown.add(BurndownPoint.builder()
                    .date(currentDate.format(DATE_FORMATTER))
                    .ideal_remaining(Math.round(idealRemaining * 10) / 10.0)
                    .actual_remaining(actualRemaining)
                    .ideal_remaining_minutes(Math.round(idealRemainingMinutes * 10) / 10.0)
                    .actual_remaining_minutes(actualRemainingMinutes)
                    .build());

            currentDate = currentDate.plusDays(1);
        }

        return burndown;
    }

    // ==================== Team Productivity ====================

    private List<MemberProductivity> calculateTeamProductivity(
            List<BoardMember> members,
            List<Task> allTasks,
            String boardId,
            String milestoneId,
            int stuckChecklistDays,
            List<ScheduleBlock> allScheduleBlocks,
            Map<String, Long> taskActualMinutes
    ) {
        List<MemberProductivity> productivityList = new ArrayList<>();
        LocalDateTime stuckThreshold = LocalDateTime.now(ZoneOffset.UTC).minusDays(stuckChecklistDays);

        // allTasks에 포함된 Task의 ID 집합 (마일스톤 필터 적용된 상태)
        Set<String> filteredTaskIds = allTasks.stream()
                .map(Task::getId)
                .collect(Collectors.toSet());

        // 마일스톤 할당 정보 로드 (milestoneId가 있을 때만)
        Map<String, MilestoneAllocation> memberAllocations = new HashMap<>();
        if (milestoneId != null && !milestoneId.isEmpty()) {
            List<MilestoneAllocation> allocations = milestoneAllocationRepository.findByMilestoneIdWithMember(milestoneId);
            for (MilestoneAllocation allocation : allocations) {
                memberAllocations.put(allocation.getMember().getId(), allocation);
            }
        }

        // 사용자별 ScheduleBlock 그룹화 (마일스톤에 해당하는 Task의 체크리스트만)
        Map<String, List<ScheduleBlock>> memberScheduleBlocks = allScheduleBlocks.stream()
                .filter(sb -> sb.getChecklistItem() != null &&
                        sb.getChecklistItem().getTask() != null &&
                        filteredTaskIds.contains(sb.getChecklistItem().getTask().getId()))
                .collect(Collectors.groupingBy(sb -> sb.getAssignee().getId()));

        // Batch load: 모든 필터링된 Task의 ChecklistItem (N+1 방지)
        List<String> allFilteredTaskIdList = new ArrayList<>(filteredTaskIds);
        List<ChecklistItem> allBatchedChecklistItems = allFilteredTaskIdList.isEmpty() ?
                Collections.emptyList() : checklistItemRepository.findByTaskIdIn(allFilteredTaskIdList);
        Map<String, List<ChecklistItem>> batchedChecklistsByTaskId = allBatchedChecklistItems.stream()
                .collect(Collectors.groupingBy(ci -> ci.getTask().getId()));

        for (BoardMember member : members) {
            User user = member.getUser();
            if (user == null) continue;

            // ========== ChecklistItem 담당자 기준 Task/체크리스트 수집 ==========

            // 해당 멤버가 담당자인 모든 체크리스트 가져오기
            List<ChecklistItem> memberChecklists = checklistItemRepository.findByBoardIdAndAssigneeId(boardId, user.getId());

            // 마일스톤에 해당하는 체크리스트만 필터링
            List<ChecklistItem> filteredChecklists = memberChecklists.stream()
                    .filter(c -> filteredTaskIds.contains(c.getTask().getId()))
                    .collect(Collectors.toList());

            // ChecklistItem 담당자 기준 모든 Task 목록 (중복 제거)
            Set<String> assignedTaskIds = filteredChecklists.stream()
                    .map(c -> c.getTask().getId())
                    .collect(Collectors.toSet());

            List<Task> assignedTasks = allTasks.stream()
                    .filter(t -> assignedTaskIds.contains(t.getId()))
                    .collect(Collectors.toList());

            // ========== 할당/완료/완료율 (ChecklistItem 담당자 기준) ==========
            int assignedTaskCount = assignedTasks.size();
            int completedTaskCount = (int) assignedTasks.stream().filter(Task::getIsCompleted).count();
            int inProgressTaskCount = assignedTaskCount - completedTaskCount;
            double completionRate = assignedTaskCount > 0 ? (completedTaskCount * 100.0 / assignedTaskCount) : 0;

            // ========== 작업 시간 (MilestoneAllocation 기반) ==========
            MilestoneAllocation allocation = memberAllocations.get(user.getId());
            Double allocatedHours = null;
            Double actualHours = null;
            Double allocatedHoursPerDay = DEFAULT_HOURS_PER_DAY;

            if (allocation != null) {
                allocatedHours = allocation.getTotalAllocatedHours();
                allocatedHoursPerDay = allocation.getWorkingDays() > 0 ?
                        allocation.getTotalAllocatedHours() / allocation.getWorkingDays() : DEFAULT_HOURS_PER_DAY;
            }

            // 마일스톤에서 실제 사용한 시간 (분 -> 시간)
            long actualMinutesInMilestone = memberScheduleBlocks.getOrDefault(user.getId(), Collections.emptyList()).stream()
                    .mapToLong(this::calculateBlockMinutes)
                    .sum();
            actualHours = actualMinutesInMilestone / 60.0;

            // ========== 최근 7일 평균 작업 시간 (업무 과열 판정용) ==========
            LocalDate sevenDaysAgo = LocalDate.now().minusDays(7);
            double recentMinutesTotal = memberScheduleBlocks.getOrDefault(user.getId(), Collections.emptyList()).stream()
                    .filter(sb -> !sb.getScheduledDate().isBefore(sevenDaysAgo))
                    .mapToLong(this::calculateBlockMinutes)
                    .sum();
            double recentAverageHoursPerDay = recentMinutesTotal / 60.0 / 7.0;

            // ========== 상태 판정 (업무 과열 여부) ==========
            String status = determineWorkloadStatus(recentAverageHoursPerDay, allocatedHoursPerDay, allocation != null);

            // ========== 체크리스트 통계 (마일스톤 기준) ==========
            int totalChecklists = filteredChecklists.size();
            int completedChecklists = (int) filteredChecklists.stream().filter(ChecklistItem::getIsCompleted).count();
            double checklistCompletionRate = totalChecklists > 0 ?
                    (completedChecklists * 100.0 / totalChecklists) : 0;

            // ========== Task 상세 목록 ==========
            List<InProgressTask> assignedTaskDetails = assignedTasks.stream()
                    .map(t -> {
                        int daysInProgress = (int) ChronoUnit.DAYS.between(
                                t.getCreatedAt().toLocalDate(), LocalDate.now());
                        List<ChecklistItem> taskChecklistItems = batchedChecklistsByTaskId.getOrDefault(t.getId(), Collections.emptyList());
                        int checklistTotal = taskChecklistItems.size();
                        int checklistCompleted = (int) taskChecklistItems.stream().filter(ChecklistItem::getIsCompleted).count();
                        Integer estimatedMinutes = t.getEstimatedMinutes();
                        Integer actualMinutes = taskActualMinutes.getOrDefault(t.getId(), 0L).intValue();
                        Double taskTimeEfficiency = null;
                        if (estimatedMinutes != null && estimatedMinutes > 0 && actualMinutes > 0) {
                            taskTimeEfficiency = Math.round((actualMinutes * 100.0 / estimatedMinutes) * 10) / 10.0;
                        }
                        return InProgressTask.builder()
                                .task_id(t.getId())
                                .task_title(t.getTitle())
                                .feature_id(t.getFeature().getId())
                                .feature_title(t.getFeature().getTitle())
                                .feature_color(t.getFeature().getColor())
                                .current_block(t.getBlock().getName())
                                .days_in_progress(daysInProgress)
                                .start_date(t.getStartDate() != null ? t.getStartDate().format(DATE_FORMATTER) : null)
                                .due_date(t.getDueDate() != null ? t.getDueDate().format(DATE_FORMATTER) : null)
                                .checklist_total(checklistTotal)
                                .checklist_completed(checklistCompleted)
                                .estimated_minutes(estimatedMinutes)
                                .actual_minutes(actualMinutes)
                                .time_efficiency(taskTimeEfficiency)
                                .build();
                    })
                    .collect(Collectors.toList());

            // ========== 체크리스트 상세 목록 ==========
            List<MemberChecklistInfo> allChecklistDetails = filteredChecklists.stream()
                    .map(c -> MemberChecklistInfo.builder()
                            .checklist_id(c.getId())
                            .checklist_title(c.getTitle())
                            .task_id(c.getTask().getId())
                            .task_title(c.getTask().getTitle())
                            .feature_id(c.getTask().getFeature().getId())
                            .feature_title(c.getTask().getFeature().getTitle())
                            .feature_color(c.getTask().getFeature().getColor())
                            .is_completed(c.getIsCompleted())
                            .created_at(c.getCreatedAt() != null ? c.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) : null)
                            .completed_at(c.getCompletedAt() != null ? c.getCompletedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) : null)
                            .build())
                    .collect(Collectors.toList());

            List<MemberChecklistInfo> inProgressChecklistDetails = filteredChecklists.stream()
                    .filter(c -> !c.getIsCompleted())
                    .map(c -> MemberChecklistInfo.builder()
                            .checklist_id(c.getId())
                            .checklist_title(c.getTitle())
                            .task_id(c.getTask().getId())
                            .task_title(c.getTask().getTitle())
                            .feature_id(c.getTask().getFeature().getId())
                            .feature_title(c.getTask().getFeature().getTitle())
                            .feature_color(c.getTask().getFeature().getColor())
                            .is_completed(false)
                            .created_at(c.getCreatedAt() != null ? c.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) : null)
                            .completed_at(null)
                            .build())
                    .collect(Collectors.toList());

            // 막힌 체크리스트 (기존 로직 유지, 마일스톤 필터 적용)
            List<ChecklistItem> stuckItems = checklistItemRepository.findStuckChecklistsByAssignee(
                    boardId, user.getId(), stuckThreshold);
            List<StuckChecklistItem> stuckChecklists = stuckItems.stream()
                    .filter(c -> filteredTaskIds.contains(c.getTask().getId()))
                    .map(c -> StuckChecklistItem.builder()
                            .checklist_id(c.getId())
                            .checklist_title(c.getTitle())
                            .task_id(c.getTask().getId())
                            .task_title(c.getTask().getTitle())
                            .feature_title(c.getTask().getFeature().getTitle())
                            .days_stuck((int) ChronoUnit.DAYS.between(
                                    c.getCreatedAt().toLocalDate(), LocalDate.now()))
                            .created_at(c.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                            .build())
                    .collect(Collectors.toList());

            // 최근 완료 Task (기존 로직 유지, 담당 Task 기준)
            List<RecentCompletedTask> recentCompleted = assignedTasks.stream()
                    .filter(Task::getIsCompleted)
                    .filter(t -> t.getCompletedAt() != null)
                    .sorted(Comparator.comparing(Task::getCompletedAt).reversed())
                    .limit(5)
                    .map(t -> {
                        int daysToComplete = t.getStartDate() != null ?
                                (int) ChronoUnit.DAYS.between(t.getStartDate(),
                                        t.getCompletedAt().toLocalDate()) :
                                (int) ChronoUnit.DAYS.between(t.getCreatedAt().toLocalDate(),
                                        t.getCompletedAt().toLocalDate());
                        return RecentCompletedTask.builder()
                                .task_id(t.getId())
                                .task_title(t.getTitle())
                                .feature_title(t.getFeature().getTitle())
                                .completed_at(t.getCompletedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                                .days_to_complete(daysToComplete)
                                .build();
                    })
                    .collect(Collectors.toList());

            productivityList.add(MemberProductivity.builder()
                    .member(MemberInfo.builder()
                            .id(user.getId())
                            .name(user.getName())
                            .profile_image(user.getProfileImage())
                            .role(member.getRole().name())
                            .build())
                    .assigned_tasks(assignedTaskCount)
                    .completed_tasks(completedTaskCount)
                    .in_progress_tasks(inProgressTaskCount)
                    .completion_rate(Math.round(completionRate * 10) / 10.0)
                    .total_checklists(totalChecklists)
                    .completed_checklists(completedChecklists)
                    .checklist_completion_rate(Math.round(checklistCompletionRate * 10) / 10.0)
                    .status(status)
                    .in_progress_task_details(assignedTaskDetails) // 이전 호환성
                    .stuck_checklists(stuckChecklists)
                    .recent_completed_tasks(recentCompleted)
                    // 작업 시간 (MilestoneAllocation 기반)
                    .total_estimated_minutes(allocatedHours != null ? (int)(allocatedHours * 60) : null)
                    .total_actual_minutes((int)(actualHours * 60))
                    .time_efficiency(null) // 효율 제거
                    .average_minutes_per_day(Math.round(recentAverageHoursPerDay * 60 * 100) / 100.0)
                    // ChecklistItem 담당자 기준 새 필드
                    .assigned_task_details(assignedTaskDetails)
                    .all_checklist_details(allChecklistDetails)
                    .in_progress_checklist_details(inProgressChecklistDetails)
                    .build());
        }

        // 완료율 기준 내림차순 정렬
        productivityList.sort(Comparator.comparing(MemberProductivity::getCompletion_rate).reversed());

        return productivityList;
    }

    /**
     * 업무 과열 상태 판정
     * - OVERWORKED: 최근 7일 일 평균 > 할당 일 평균 × 130%
     * - NORMAL: 70% ~ 130% 범위
     * - RELAXED: 최근 7일 일 평균 < 할당 일 평균 × 70%
     * - NOT_ALLOCATED: MilestoneAllocation 데이터 없음
     */
    private String determineWorkloadStatus(double recentAverageHoursPerDay, double allocatedHoursPerDay, boolean hasAllocation) {
        if (!hasAllocation) {
            // 할당 없으면 기본 8시간 기준으로 판정
            if (recentAverageHoursPerDay > DEFAULT_HOURS_PER_DAY * 1.3) {
                return "OVERWORKED";
            } else if (recentAverageHoursPerDay < DEFAULT_HOURS_PER_DAY * 0.7) {
                return "RELAXED";
            }
            return "NORMAL";
        }

        double ratio = recentAverageHoursPerDay / allocatedHoursPerDay;
        if (ratio > 1.3) {
            return "OVERWORKED";
        } else if (ratio < 0.7) {
            return "RELAXED";
        }
        return "NORMAL";
    }

    // ==================== Delayed Items ====================

    private DelayedItems identifyDelayedItems(
            String boardId,
            List<Feature> allFeatures,
            List<Task> allTasks,
            List<Block> blocks,
            int stagnantTaskDays,
            int stuckChecklistDays
    ) {
        LocalDateTime stagnantThreshold = LocalDateTime.now(ZoneOffset.UTC).minusDays(stagnantTaskDays);
        LocalDateTime stuckThreshold = LocalDateTime.now(ZoneOffset.UTC).minusDays(stuckChecklistDays);

        // 1. 마감 초과 Feature
        List<OverdueFeature> overdueFeatures = allFeatures.stream()
                .filter(f -> f.getDueDate() != null &&
                        f.getDueDate().isBefore(LocalDate.now()) &&
                        f.getCompletedTasks() < f.getTotalTasks())
                .map(f -> {
                    int daysOverdue = (int) ChronoUnit.DAYS.between(f.getDueDate(), LocalDate.now());
                    double progress = f.getTotalTasks() > 0 ?
                            (f.getCompletedTasks() * 100.0 / f.getTotalTasks()) : 0;

                    return OverdueFeature.builder()
                            .feature_id(f.getId())
                            .feature_title(f.getTitle())
                            .feature_color(f.getColor())
                            .due_date(f.getDueDate().format(DATE_FORMATTER))
                            .days_overdue(daysOverdue)
                            .assignee(f.getAssignee() != null ? MemberInfo.builder()
                                    .id(f.getAssignee().getId())
                                    .name(f.getAssignee().getName())
                                    .profile_image(f.getAssignee().getProfileImage())
                                    .build() : null)
                            .progress_percentage(Math.round(progress * 10) / 10.0)
                            .tasks_remaining(f.getTotalTasks() - f.getCompletedTasks())
                            .build();
                })
                .sorted(Comparator.comparing(OverdueFeature::getDays_overdue).reversed())
                .collect(Collectors.toList());

        // 2. 정체 Task
        List<Task> stagnantTaskList = taskRepository.findStagnantTasks(boardId, stagnantThreshold);
        List<StagnantTask> stagnantTasks = stagnantTaskList.stream()
                .map(t -> {
                    int daysInBlock = (int) ChronoUnit.DAYS.between(
                            t.getUpdatedAt().toLocalDate(), LocalDate.now());
                    boolean isOverdue = t.getDueDate() != null && t.getDueDate().isBefore(LocalDate.now());

                    return StagnantTask.builder()
                            .task_id(t.getId())
                            .task_title(t.getTitle())
                            .feature_id(t.getFeature().getId())
                            .feature_title(t.getFeature().getTitle())
                            .feature_color(t.getFeature().getColor())
                            .current_block(t.getBlock().getId())
                            .block_name(t.getBlock().getName())
                            .days_in_block(daysInBlock)
                            // v7.0: Task.assignee 제거 - ChecklistItem에서 담당자 확인
                            .assignee(null)
                            .due_date(t.getDueDate() != null ? t.getDueDate().format(DATE_FORMATTER) : null)
                            .is_overdue(isOverdue)
                            .build();
                })
                .sorted(Comparator.comparing(StagnantTask::getDays_in_block).reversed())
                .collect(Collectors.toList());

        // 3. 막힌 체크리스트
        List<ChecklistItem> stuckChecklistItems = checklistItemRepository.findStuckChecklists(
                boardId, stuckThreshold);
        List<StuckChecklist> stuckChecklists = stuckChecklistItems.stream()
                .map(c -> {
                    int daysStuck = (int) ChronoUnit.DAYS.between(
                            c.getCreatedAt().toLocalDate(), LocalDate.now());

                    return StuckChecklist.builder()
                            .checklist_id(c.getId())
                            .checklist_title(c.getTitle())
                            .task_id(c.getTask().getId())
                            .task_title(c.getTask().getTitle())
                            .feature_id(c.getTask().getFeature().getId())
                            .feature_title(c.getTask().getFeature().getTitle())
                            .feature_color(c.getTask().getFeature().getColor())
                            .days_stuck(daysStuck)
                            .assignee(c.getAssignee() != null ? MemberInfo.builder()
                                    .id(c.getAssignee().getId())
                                    .name(c.getAssignee().getName())
                                    .profile_image(c.getAssignee().getProfileImage())
                                    .build() : null)
                            .due_date(c.getDueDate() != null ? c.getDueDate().format(DATE_FORMATTER) : null)
                            .build();
                })
                .sorted(Comparator.comparing(StuckChecklist::getDays_stuck).reversed())
                .collect(Collectors.toList());

        // 4. 병목 요약
        BottleneckSummary bottleneckSummary = calculateBottleneckSummary(
                overdueFeatures, stagnantTasks, stuckChecklists
        );

        return DelayedItems.builder()
                .overdue_features(overdueFeatures)
                .stagnant_tasks(stagnantTasks)
                .stuck_checklists(stuckChecklists)
                .bottleneck_summary(bottleneckSummary)
                .build();
    }

    private BottleneckSummary calculateBottleneckSummary(
            List<OverdueFeature> overdueFeatures,
            List<StagnantTask> stagnantTasks,
            List<StuckChecklist> stuckChecklists
    ) {
        // 가장 지연이 많은 담당자 찾기
        Map<String, MemberDelayCount> memberDelays = new HashMap<>();

        for (StagnantTask task : stagnantTasks) {
            if (task.getAssignee() != null) {
                memberDelays.computeIfAbsent(task.getAssignee().getId(),
                        k -> new MemberDelayCount(task.getAssignee()));
                memberDelays.get(task.getAssignee().getId()).incrementStagnant();
            }
        }

        for (StuckChecklist checklist : stuckChecklists) {
            if (checklist.getAssignee() != null) {
                memberDelays.computeIfAbsent(checklist.getAssignee().getId(),
                        k -> new MemberDelayCount(checklist.getAssignee()));
                memberDelays.get(checklist.getAssignee().getId()).incrementStuck();
            }
        }

        MemberBottleneck mostDelayedMember = memberDelays.values().stream()
                .max(Comparator.comparing(MemberDelayCount::getTotal))
                .map(m -> MemberBottleneck.builder()
                        .member(m.member)
                        .delayed_item_count(m.getTotal())
                        .overdue_tasks(m.stagnantCount)
                        .stuck_checklists(m.stuckCount)
                        .build())
                .orElse(null);

        // 가장 문제가 많은 블록 찾기
        Map<String, BlockDelayCount> blockDelays = new HashMap<>();
        for (StagnantTask task : stagnantTasks) {
            blockDelays.computeIfAbsent(task.getBlock_name(),
                    k -> new BlockDelayCount(task.getCurrent_block(), task.getBlock_name()));
            blockDelays.get(task.getBlock_name()).addDays(task.getDays_in_block());
        }

        BlockBottleneck mostProblematicBlock = blockDelays.values().stream()
                .max(Comparator.comparing(BlockDelayCount::getCount))
                .map(b -> BlockBottleneck.builder()
                        .block_id(b.blockId)
                        .block_name(b.blockName)
                        .stuck_task_count(b.count)
                        .average_days_stuck(Math.round(b.getAverageDays() * 10) / 10.0)
                        .build())
                .orElse(null);

        return BottleneckSummary.builder()
                .most_delayed_member(mostDelayedMember)
                .most_problematic_block(mostProblematicBlock)
                .total_overdue_features(overdueFeatures.size())
                .total_stagnant_tasks(stagnantTasks.size())
                .total_stuck_checklists(stuckChecklists.size())
                .build();
    }

    // Helper classes for bottleneck calculation
    private static class MemberDelayCount {
        MemberInfo member;
        int stagnantCount = 0;
        int stuckCount = 0;

        MemberDelayCount(MemberInfo member) {
            this.member = member;
        }

        void incrementStagnant() { stagnantCount++; }
        void incrementStuck() { stuckCount++; }
        int getTotal() { return stagnantCount + stuckCount; }
    }

    private static class BlockDelayCount {
        String blockId;
        String blockName;
        int count = 0;
        int totalDays = 0;

        BlockDelayCount(String blockId, String blockName) {
            this.blockId = blockId;
            this.blockName = blockName;
        }

        void addDays(int days) {
            count++;
            totalDays += days;
        }

        int getCount() { return count; }
        double getAverageDays() { return count > 0 ? (double) totalDays / count : 0; }
    }

    // ==================== Summary ====================

    private ManagementSummary calculateSummary(
            List<MilestoneHealth> milestoneHealth,
            List<MemberProductivity> teamProductivity,
            DelayedItems delayedItems
    ) {
        int totalMilestones = milestoneHealth.size();
        int onTrackMilestones = (int) milestoneHealth.stream()
                .filter(m -> "ON_TRACK".equals(m.getStatus()))
                .count();
        int atRiskMilestones = (int) milestoneHealth.stream()
                .filter(m -> "AT_RISK".equals(m.getStatus()) || "SLOW".equals(m.getStatus()))
                .count();
        int overdueMilestones = (int) milestoneHealth.stream()
                .filter(m -> "OVERDUE".equals(m.getStatus()))
                .count();

        int totalMembers = teamProductivity.size();
        int membersOnTrack = (int) teamProductivity.stream()
                .filter(m -> "NORMAL".equals(m.getStatus()) || "COMPLETED".equals(m.getStatus()))
                .count();
        int membersNeedingAttention = (int) teamProductivity.stream()
                .filter(m -> "NEEDS_ATTENTION".equals(m.getStatus()))
                .count();

        int totalDelayedItems = delayedItems.getOverdue_features().size() +
                delayedItems.getStagnant_tasks().size() +
                delayedItems.getStuck_checklists().size();

        // 전체 건강 점수 계산 (0-100)
        double healthScore = 100;
        if (totalMilestones > 0) {
            healthScore -= (overdueMilestones * 30.0 / totalMilestones);
            healthScore -= (atRiskMilestones * 15.0 / totalMilestones);
        }
        if (totalMembers > 0) {
            healthScore -= (membersNeedingAttention * 10.0 / totalMembers);
        }
        healthScore -= Math.min(20, totalDelayedItems * 2);
        healthScore = Math.max(0, Math.min(100, healthScore));

        return ManagementSummary.builder()
                .total_milestones(totalMilestones)
                .on_track_milestones(onTrackMilestones)
                .at_risk_milestones(atRiskMilestones)
                .overdue_milestones(overdueMilestones)
                .total_members(totalMembers)
                .members_on_track(membersOnTrack)
                .members_needing_attention(membersNeedingAttention)
                .total_delayed_items(totalDelayedItems)
                .overall_health_score(Math.round(healthScore * 10) / 10.0)
                .build();
    }
}
