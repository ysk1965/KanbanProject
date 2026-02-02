package com.kanban.domain.statistics.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.milestone.MilestoneFeatureRepository;
import com.kanban.domain.schedule.ScheduleBlock;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.statistics.dto.StatisticsResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.weight.TaskWeight;
import com.kanban.domain.weight.TaskWeightRepository;
import com.kanban.domain.weight.WeightLevel;
import com.kanban.domain.weight.WeightLevelRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StatisticsService {

    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final FeatureRepository featureRepository;
    private final TaskRepository taskRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final WeightLevelRepository weightLevelRepository;
    private final TaskWeightRepository taskWeightRepository;
    private final MilestoneFeatureRepository milestoneFeatureRepository;
    private final ChecklistItemRepository checklistItemRepository;

    public StatisticsResponse.BoardStatistics getBoardStatistics(
            String boardId,
            String userId,
            LocalDate startDate,
            LocalDate endDate,
            List<String> milestoneIds,
            List<String> featureIds,
            List<String> memberIds,
            List<String> tagIds
    ) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // 기본 날짜 설정 (최근 30일)
        if (endDate == null) {
            endDate = LocalDate.now();
        }
        if (startDate == null) {
            startDate = endDate.minusDays(30);
        }

        // 스케줄 블록 조회
        List<ScheduleBlock> scheduleBlocks = scheduleBlockRepository.findByBoardIdAndScheduledDateBetween(
                boardId, startDate, endDate
        );

        // 필터 적용 - 멤버
        if (memberIds != null && !memberIds.isEmpty()) {
            Set<String> memberIdSet = new HashSet<>(memberIds);
            scheduleBlocks = scheduleBlocks.stream()
                    .filter(sb -> sb.getAssignee() != null && memberIdSet.contains(sb.getAssignee().getId()))
                    .collect(Collectors.toList());
        }

        // Feature 조회
        List<Feature> features = featureRepository.findByBoardIdOrderByPositionAsc(boardId);

        // 마일스톤 필터 적용
        Set<String> milestoneFeatureIds = null;
        if (milestoneIds != null && !milestoneIds.isEmpty()) {
            milestoneFeatureIds = new HashSet<>();
            for (String milestoneId : milestoneIds) {
                milestoneFeatureIds.addAll(milestoneFeatureRepository.findFeatureIdsByMilestoneId(milestoneId));
            }
            Set<String> finalMilestoneFeatureIds = milestoneFeatureIds;
            features = features.stream()
                    .filter(f -> finalMilestoneFeatureIds.contains(f.getId()))
                    .collect(Collectors.toList());
        }

        // Feature ID 필터 적용
        if (featureIds != null && !featureIds.isEmpty()) {
            Set<String> featureIdSet = new HashSet<>(featureIds);
            features = features.stream()
                    .filter(f -> featureIdSet.contains(f.getId()))
                    .collect(Collectors.toList());
        }

        // Task 조회
        List<Task> tasks = taskRepository.findByBoardIdOrderByPositionAsc(boardId);

        // 마일스톤/Feature 필터에 따라 Task도 필터링
        Set<String> filteredFeatureIds = features.stream()
                .map(Feature::getId)
                .collect(Collectors.toSet());

        if (milestoneIds != null && !milestoneIds.isEmpty()) {
            tasks = tasks.stream()
                    .filter(t -> t.getFeature() != null && filteredFeatureIds.contains(t.getFeature().getId()))
                    .collect(Collectors.toList());

            // 스케줄 블록도 해당 Task들로 필터링
            Set<String> filteredTaskIds = tasks.stream()
                    .map(Task::getId)
                    .collect(Collectors.toSet());

            scheduleBlocks = scheduleBlocks.stream()
                    .filter(sb -> {
                        if (sb.getChecklistItem() == null || sb.getChecklistItem().getTask() == null) {
                            return false;
                        }
                        return filteredTaskIds.contains(sb.getChecklistItem().getTask().getId());
                    })
                    .collect(Collectors.toList());
        }

        // 멤버 조회
        List<BoardMember> boardMembers = boardMemberRepository.findByBoardId(boardId);

        // Batch load: 보드의 모든 체크리스트 아이템 (N+1 방지)
        List<ChecklistItem> allChecklistItems = checklistItemRepository.findByBoardId(boardId);
        Map<String, List<ChecklistItem>> checklistsByTaskId = allChecklistItems.stream()
                .collect(Collectors.groupingBy(ci -> ci.getTask().getId()));

        // Summary 계산
        StatisticsResponse.Summary summary = calculateSummary(scheduleBlocks, features, tasks, startDate, endDate);

        // By Member 계산
        List<StatisticsResponse.MemberStatistics> byMember = calculateByMember(scheduleBlocks, tasks, boardMembers, features, checklistsByTaskId);

        // By Feature 계산
        List<StatisticsResponse.FeatureStatistics> byFeature = calculateByFeature(scheduleBlocks, tasks, features, boardMembers);

        // By Tag 계산 (빈 리스트 - Task에 tags가 없음)
        List<StatisticsResponse.TagStatistics> byTag = new ArrayList<>();

        // Impact 계산
        StatisticsResponse.ImpactStatistics impact = calculateImpact(boardId, scheduleBlocks, boardMembers);

        // Daily Trend 계산
        List<StatisticsResponse.DailyTrend> dailyTrend = calculateDailyTrend(scheduleBlocks, tasks, startDate, endDate);

        return StatisticsResponse.BoardStatistics.builder()
                .summary(summary)
                .by_member(byMember)
                .by_feature(byFeature)
                .by_tag(byTag)
                .impact(impact)
                .daily_trend(dailyTrend)
                .build();
    }

    public StatisticsResponse.PersonalStatistics getPersonalStatistics(
            String boardId,
            String userId,
            LocalDate startDate,
            LocalDate endDate
    ) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // 기본 날짜 설정
        if (endDate == null) {
            endDate = LocalDate.now();
        }
        if (startDate == null) {
            startDate = endDate.minusDays(30);
        }

        // 본인의 스케줄 블록만 조회
        List<ScheduleBlock> myBlocks = scheduleBlockRepository.findByBoardIdAndScheduledDateBetween(
                boardId, startDate, endDate
        ).stream()
                .filter(sb -> sb.getAssignee() != null && sb.getAssignee().getId().equals(userId))
                .collect(Collectors.toList());

        // v7.0: Task.assignee 제거 - ChecklistItem assignee 기준으로 Task 조회
        // 본인이 담당한 ChecklistItem이 있는 Task 조회 (N+1 방지: 배치 로드)
        List<ChecklistItem> allBoardChecklists = checklistItemRepository.findByBoardId(boardId);
        Map<String, List<ChecklistItem>> personalChecklistsByTaskId = allBoardChecklists.stream()
                .collect(Collectors.groupingBy(ci -> ci.getTask().getId()));

        List<Task> myTasks = taskRepository.findByBoardIdOrderByPositionAsc(boardId).stream()
                .filter(t -> personalChecklistsByTaskId.getOrDefault(t.getId(), Collections.emptyList()).stream()
                        .anyMatch(ci -> ci.getAssignee() != null && ci.getAssignee().getId().equals(userId)))
                .collect(Collectors.toList());

        // Summary
        long totalMinutes = myBlocks.stream().mapToLong(this::getBlockMinutes).sum();
        long completedMinutes = myBlocks.stream()
                .filter(sb -> sb.getChecklistItem() != null && sb.getChecklistItem().getIsCompleted())
                .mapToLong(this::getBlockMinutes).sum();
        int completedTasks = (int) myTasks.stream().filter(Task::getIsCompleted).count();

        StatisticsResponse.PersonalSummary summary = StatisticsResponse.PersonalSummary.builder()
                .total_work_minutes(totalMinutes)
                .completed_work_minutes(completedMinutes)
                .total_tasks(myTasks.size())
                .completed_tasks(completedTasks)
                .impact_score(totalMinutes * 1.0) // 간단한 점수 계산
                .build();

        // By Feature
        Map<String, Long> featureMinutes = new HashMap<>();
        Map<String, Integer> featureTaskCount = new HashMap<>();
        Map<String, Feature> featureMap = new HashMap<>();

        for (ScheduleBlock block : myBlocks) {
            if (block.getChecklistItem() != null && block.getChecklistItem().getTask() != null) {
                Task task = block.getChecklistItem().getTask();
                if (task.getFeature() != null) {
                    String featureId = task.getFeature().getId();
                    featureMap.put(featureId, task.getFeature());
                    featureMinutes.merge(featureId, getBlockMinutes(block), Long::sum);
                }
            }
        }
        for (Task task : myTasks) {
            if (task.getFeature() != null) {
                String featureId = task.getFeature().getId();
                featureTaskCount.merge(featureId, 1, Integer::sum);
            }
        }

        List<StatisticsResponse.PersonalFeatureTime> byFeature = featureMinutes.entrySet().stream()
                .map(entry -> {
                    Feature f = featureMap.get(entry.getKey());
                    return StatisticsResponse.PersonalFeatureTime.builder()
                            .feature_id(entry.getKey())
                            .feature_title(f != null ? f.getTitle() : "Unknown")
                            .feature_color(f != null ? f.getColor() : "#6366f1")
                            .minutes(entry.getValue())
                            .task_count(featureTaskCount.getOrDefault(entry.getKey(), 0))
                            .build();
                })
                .sorted((a, b) -> Long.compare(b.getMinutes(), a.getMinutes()))
                .collect(Collectors.toList());

        // By Tag - 빈 리스트 (Task에 tags가 없음)
        List<StatisticsResponse.PersonalTagTime> byTag = new ArrayList<>();

        // Top Tasks
        Map<String, Long> taskMinutes = new HashMap<>();
        Map<String, Task> taskMap = new HashMap<>();

        for (ScheduleBlock block : myBlocks) {
            if (block.getChecklistItem() != null && block.getChecklistItem().getTask() != null) {
                Task task = block.getChecklistItem().getTask();
                taskMap.put(task.getId(), task);
                taskMinutes.merge(task.getId(), getBlockMinutes(block), Long::sum);
            }
        }

        List<StatisticsResponse.TopTask> topTasks = taskMinutes.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue(), a.getValue()))
                .limit(10)
                .map(entry -> {
                    Task t = taskMap.get(entry.getKey());
                    return StatisticsResponse.TopTask.builder()
                            .task_id(entry.getKey())
                            .task_title(t != null ? t.getTitle() : "Unknown")
                            .feature_title(t != null && t.getFeature() != null ? t.getFeature().getTitle() : "Unknown")
                            .minutes(entry.getValue())
                            .build();
                })
                .collect(Collectors.toList());

        // Daily Trend
        LocalDate finalStartDate = startDate;
        LocalDate finalEndDate = endDate;
        Map<LocalDate, Long> dailyMinutes = myBlocks.stream()
                .collect(Collectors.groupingBy(
                        ScheduleBlock::getScheduledDate,
                        Collectors.summingLong(this::getBlockMinutes)
                ));

        List<StatisticsResponse.PersonalDailyTrend> dailyTrend = new ArrayList<>();
        for (LocalDate date = finalStartDate; !date.isAfter(finalEndDate); date = date.plusDays(1)) {
            dailyTrend.add(StatisticsResponse.PersonalDailyTrend.builder()
                    .date(date.format(DateTimeFormatter.ISO_LOCAL_DATE))
                    .minutes(dailyMinutes.getOrDefault(date, 0L))
                    .build());
        }

        return StatisticsResponse.PersonalStatistics.builder()
                .summary(summary)
                .by_feature(byFeature)
                .by_tag(byTag)
                .top_tasks(topTasks)
                .daily_trend(dailyTrend)
                .build();
    }

    private StatisticsResponse.Summary calculateSummary(
            List<ScheduleBlock> blocks,
            List<Feature> features,
            List<Task> tasks,
            LocalDate startDate,
            LocalDate endDate
    ) {
        long totalMinutes = blocks.stream().mapToLong(this::getBlockMinutes).sum();
        long completedMinutes = blocks.stream()
                .filter(sb -> sb.getChecklistItem() != null && sb.getChecklistItem().getIsCompleted())
                .mapToLong(this::getBlockMinutes).sum();

        int completedTasks = (int) tasks.stream().filter(Task::getIsCompleted).count();
        int completedFeatures = (int) features.stream()
                .filter(f -> f.getTotalTasks() > 0 && f.getCompletedTasks() >= f.getTotalTasks())
                .count();

        double avgProgress = features.isEmpty() ? 0 :
                features.stream()
                        .mapToDouble(f -> f.getTotalTasks() > 0 ? (double) f.getCompletedTasks() / f.getTotalTasks() * 100 : 0)
                        .average().orElse(0);

        double focusRate = totalMinutes > 0 ? (double) completedMinutes / totalMinutes * 100 : 0;

        return StatisticsResponse.Summary.builder()
                .total_work_minutes(totalMinutes)
                .completed_work_minutes(completedMinutes)
                .incomplete_work_minutes(totalMinutes - completedMinutes)
                .total_tasks(tasks.size())
                .completed_tasks(completedTasks)
                .incomplete_tasks(tasks.size() - completedTasks)
                .total_features(features.size())
                .completed_features(completedFeatures)
                .average_feature_progress(avgProgress)
                .focus_rate(focusRate)
                .period_start(startDate.format(DateTimeFormatter.ISO_LOCAL_DATE))
                .period_end(endDate.format(DateTimeFormatter.ISO_LOCAL_DATE))
                .build();
    }

    private List<StatisticsResponse.MemberStatistics> calculateByMember(
            List<ScheduleBlock> blocks,
            List<Task> tasks,
            List<BoardMember> boardMembers,
            List<Feature> features,
            Map<String, List<ChecklistItem>> checklistsByTaskId
    ) {
        Map<String, User> memberMap = boardMembers.stream()
                .collect(Collectors.toMap(bm -> bm.getUser().getId(), BoardMember::getUser, (a, b) -> a));

        Map<String, List<ScheduleBlock>> blocksByMember = blocks.stream()
                .filter(sb -> sb.getAssignee() != null)
                .collect(Collectors.groupingBy(sb -> sb.getAssignee().getId()));

        // v7.0: Task.assignee 제거 - ChecklistItem assignee 기준으로 Task 그룹화 (N+1 방지: 배치 로드 사용)
        Map<String, List<Task>> tasksByMember = new HashMap<>();
        for (Task t : tasks) {
            List<ChecklistItem> items = checklistsByTaskId.getOrDefault(t.getId(), Collections.emptyList());
            for (ChecklistItem ci : items) {
                if (ci.getAssignee() != null) {
                    String memberId = ci.getAssignee().getId();
                    tasksByMember.computeIfAbsent(memberId, k -> new ArrayList<>());
                    if (!tasksByMember.get(memberId).contains(t)) {
                        tasksByMember.get(memberId).add(t);
                    }
                }
            }
        }

        return memberMap.entrySet().stream()
                .map(entry -> {
                    String memberId = entry.getKey();
                    User user = entry.getValue();
                    List<ScheduleBlock> memberBlocks = blocksByMember.getOrDefault(memberId, Collections.emptyList());
                    List<Task> memberTasks = tasksByMember.getOrDefault(memberId, Collections.emptyList());

                    long totalMinutes = memberBlocks.stream().mapToLong(this::getBlockMinutes).sum();
                    long completedMinutes = memberBlocks.stream()
                            .filter(sb -> sb.getChecklistItem() != null && sb.getChecklistItem().getIsCompleted())
                            .mapToLong(this::getBlockMinutes).sum();
                    int completedTasks = (int) memberTasks.stream().filter(Task::getIsCompleted).count();

                    // By Feature for this member
                    Map<String, Long> featureMinutes = new HashMap<>();
                    Map<String, Feature> featureMap = features.stream()
                            .collect(Collectors.toMap(Feature::getId, f -> f, (a, b) -> a));

                    // Feature 내 Task별 시간 계산을 위한 맵: featureId -> (taskId -> minutes)
                    Map<String, Map<String, Long>> featureTaskMinutes = new HashMap<>();
                    // Task 정보 저장: taskId -> Task
                    Map<String, Task> taskInfoMap = new HashMap<>();

                    for (ScheduleBlock block : memberBlocks) {
                        if (block.getChecklistItem() != null && block.getChecklistItem().getTask() != null) {
                            Task task = block.getChecklistItem().getTask();
                            if (task.getFeature() != null) {
                                String featureId = task.getFeature().getId();
                                long blockMinutes = getBlockMinutes(block);

                                featureMinutes.merge(featureId, blockMinutes, Long::sum);

                                // Task별 시간 누적
                                featureTaskMinutes.computeIfAbsent(featureId, k -> new HashMap<>());
                                featureTaskMinutes.get(featureId).merge(task.getId(), blockMinutes, Long::sum);
                                taskInfoMap.put(task.getId(), task);
                            }
                        }
                    }

                    List<StatisticsResponse.FeatureTime> byFeature = featureMinutes.entrySet().stream()
                            .map(fe -> {
                                String featureId = fe.getKey();
                                Feature f = featureMap.get(featureId);
                                long featureTotalMinutes = fe.getValue();

                                // 해당 Feature 내 Task별 시간 리스트 생성
                                Map<String, Long> taskMinutesMap = featureTaskMinutes.getOrDefault(featureId, Collections.emptyMap());
                                List<StatisticsResponse.FeatureTaskTime> taskTimes = taskMinutesMap.entrySet().stream()
                                        .map(te -> {
                                            String taskId = te.getKey();
                                            long taskMinutes = te.getValue();
                                            Task t = taskInfoMap.get(taskId);
                                            double percentage = featureTotalMinutes > 0
                                                    ? (double) taskMinutes / featureTotalMinutes * 100
                                                    : 0;
                                            return StatisticsResponse.FeatureTaskTime.builder()
                                                    .task_id(taskId)
                                                    .task_title(t != null ? t.getTitle() : "Unknown")
                                                    .minutes(taskMinutes)
                                                    .percentage(Math.round(percentage * 100.0) / 100.0)
                                                    .build();
                                        })
                                        .sorted((a, b) -> Long.compare(b.getMinutes(), a.getMinutes()))
                                        .collect(Collectors.toList());

                                return StatisticsResponse.FeatureTime.builder()
                                        .feature_id(featureId)
                                        .feature_title(f != null ? f.getTitle() : "Unknown")
                                        .feature_color(f != null ? f.getColor() : "#6366f1")
                                        .minutes(featureTotalMinutes)
                                        .tasks(taskTimes)
                                        .build();
                            })
                            .sorted((a, b) -> Long.compare(b.getMinutes(), a.getMinutes()))
                            .collect(Collectors.toList());

                    return StatisticsResponse.MemberStatistics.builder()
                            .member(StatisticsResponse.MemberInfo.builder()
                                    .id(memberId)
                                    .name(user.getName())
                                    .profile_image(user.getProfileImage())
                                    .build())
                            .total_minutes(totalMinutes)
                            .completed_minutes(completedMinutes)
                            .task_count(memberTasks.size())
                            .completed_task_count(completedTasks)
                            .impact_score(totalMinutes * 1.0)
                            .by_feature(byFeature)
                            .build();
                })
                .sorted((a, b) -> Long.compare(b.getTotal_minutes(), a.getTotal_minutes()))
                .collect(Collectors.toList());
    }

    private List<StatisticsResponse.FeatureStatistics> calculateByFeature(
            List<ScheduleBlock> blocks,
            List<Task> tasks,
            List<Feature> features,
            List<BoardMember> boardMembers
    ) {
        Map<String, List<ScheduleBlock>> blocksByFeature = new HashMap<>();
        for (ScheduleBlock block : blocks) {
            if (block.getChecklistItem() != null && block.getChecklistItem().getTask() != null) {
                Task task = block.getChecklistItem().getTask();
                if (task.getFeature() != null) {
                    blocksByFeature.computeIfAbsent(task.getFeature().getId(), k -> new ArrayList<>()).add(block);
                }
            }
        }

        Map<String, List<Task>> tasksByFeature = tasks.stream()
                .filter(t -> t.getFeature() != null)
                .collect(Collectors.groupingBy(t -> t.getFeature().getId()));

        return features.stream()
                .map(feature -> {
                    List<ScheduleBlock> featureBlocks = blocksByFeature.getOrDefault(feature.getId(), Collections.emptyList());
                    List<Task> featureTasks = tasksByFeature.getOrDefault(feature.getId(), Collections.emptyList());

                    long totalMinutes = featureBlocks.stream().mapToLong(this::getBlockMinutes).sum();
                    long completedMinutes = featureBlocks.stream()
                            .filter(sb -> sb.getChecklistItem() != null && sb.getChecklistItem().getIsCompleted())
                            .mapToLong(this::getBlockMinutes).sum();
                    int completedTasks = (int) featureTasks.stream().filter(Task::getIsCompleted).count();

                    // By Member for this feature
                    Map<String, Long> memberMinutes = new HashMap<>();
                    Map<String, String> memberNames = boardMembers.stream()
                            .collect(Collectors.toMap(bm -> bm.getUser().getId(), bm -> bm.getUser().getName(), (a, b) -> a));

                    for (ScheduleBlock block : featureBlocks) {
                        if (block.getAssignee() != null) {
                            memberMinutes.merge(block.getAssignee().getId(), getBlockMinutes(block), Long::sum);
                        }
                    }

                    List<StatisticsResponse.MemberTime> byMember = memberMinutes.entrySet().stream()
                            .map(me -> StatisticsResponse.MemberTime.builder()
                                    .member_id(me.getKey())
                                    .member_name(memberNames.getOrDefault(me.getKey(), "Unknown"))
                                    .minutes(me.getValue())
                                    .build())
                            .sorted((a, b) -> Long.compare(b.getMinutes(), a.getMinutes()))
                            .collect(Collectors.toList());

                    double progress = feature.getTotalTasks() > 0 ?
                            (double) feature.getCompletedTasks() / feature.getTotalTasks() * 100 : 0;

                    return StatisticsResponse.FeatureStatistics.builder()
                            .feature(StatisticsResponse.FeatureInfo.builder()
                                    .id(feature.getId())
                                    .title(feature.getTitle())
                                    .color(feature.getColor())
                                    .build())
                            .total_minutes(totalMinutes)
                            .completed_minutes(completedMinutes)
                            .task_count(featureTasks.size())
                            .completed_task_count(completedTasks)
                            .progress_percentage(progress)
                            .by_member(byMember)
                            .build();
                })
                .sorted((a, b) -> Long.compare(b.getTotal_minutes(), a.getTotal_minutes()))
                .collect(Collectors.toList());
    }

    private StatisticsResponse.ImpactStatistics calculateImpact(
            String boardId,
            List<ScheduleBlock> blocks,
            List<BoardMember> boardMembers
    ) {
        // 가중치 레벨 조회
        List<WeightLevel> weightLevels = weightLevelRepository.findByBoardIdOrderByPositionAsc(boardId);

        // Task별 가중치 조회
        List<TaskWeight> taskWeights = taskWeightRepository.findByBoardId(boardId);
        Map<String, TaskWeight> taskWeightMap = taskWeights.stream()
                .collect(Collectors.toMap(tw -> tw.getTask().getId(), tw -> tw, (a, b) -> a));

        // 기본 가중치 레벨
        WeightLevel defaultWeightLevel = weightLevels.stream()
                .filter(WeightLevel::getIsDefault)
                .findFirst()
                .orElse(null);
        double defaultWeight = defaultWeightLevel != null ? defaultWeightLevel.getWeight() : 1.0;

        // 멤버별 가중 분 계산
        Map<String, Double> memberWeightedMinutes = new HashMap<>();
        Map<String, Long> memberRawMinutes = new HashMap<>();

        for (ScheduleBlock block : blocks) {
            if (block.getAssignee() == null) continue;

            String memberId = block.getAssignee().getId();
            long minutes = getBlockMinutes(block);

            // Task의 가중치 확인
            double weight = defaultWeight;
            if (block.getChecklistItem() != null && block.getChecklistItem().getTask() != null) {
                String taskId = block.getChecklistItem().getTask().getId();
                TaskWeight tw = taskWeightMap.get(taskId);
                if (tw != null) {
                    weight = tw.getWeightLevel().getWeight();
                }
            }

            memberRawMinutes.merge(memberId, minutes, Long::sum);
            memberWeightedMinutes.merge(memberId, minutes * weight, Double::sum);
        }

        Map<String, User> userMap = boardMembers.stream()
                .collect(Collectors.toMap(bm -> bm.getUser().getId(), BoardMember::getUser, (a, b) -> a));

        List<StatisticsResponse.MemberImpact> byMember = memberWeightedMinutes.entrySet().stream()
                .map(entry -> {
                    User user = userMap.get(entry.getKey());
                    return StatisticsResponse.MemberImpact.builder()
                            .member_id(entry.getKey())
                            .member_name(user != null ? user.getName() : "Unknown")
                            .profile_image(user != null ? user.getProfileImage() : null)
                            .impact_score(entry.getValue())
                            .weighted_minutes(memberRawMinutes.getOrDefault(entry.getKey(), 0L))
                            .build();
                })
                .sorted((a, b) -> Double.compare(b.getImpact_score(), a.getImpact_score()))
                .collect(Collectors.toList());

        // 가중치 레벨별 통계
        List<StatisticsResponse.WeightLevelStats> byWeightLevel;

        if (weightLevels.isEmpty()) {
            // 가중치 레벨이 없으면 기본값 사용
            long totalMinutes = blocks.stream().mapToLong(this::getBlockMinutes).sum();
            StatisticsResponse.WeightLevel defaultLevel = StatisticsResponse.WeightLevel.builder()
                    .id("default")
                    .name("Standard")
                    .weight(1.0)
                    .color("#6366f1")
                    .position(0)
                    .is_default(true)
                    .build();
            byWeightLevel = Collections.singletonList(
                    StatisticsResponse.WeightLevelStats.builder()
                            .level(defaultLevel)
                            .total_minutes(totalMinutes)
                            .task_count(blocks.size())
                            .build()
            );
        } else {
            // 가중치 레벨별 분류
            Map<String, Long> levelMinutes = new HashMap<>();
            Map<String, Integer> levelTaskCount = new HashMap<>();

            // 기본 레벨 ID
            String defaultLevelId = defaultWeightLevel != null ? defaultWeightLevel.getId() : weightLevels.get(0).getId();

            for (ScheduleBlock block : blocks) {
                String levelId = defaultLevelId;

                if (block.getChecklistItem() != null && block.getChecklistItem().getTask() != null) {
                    String taskId = block.getChecklistItem().getTask().getId();
                    TaskWeight tw = taskWeightMap.get(taskId);
                    if (tw != null) {
                        levelId = tw.getWeightLevel().getId();
                    }
                }

                levelMinutes.merge(levelId, getBlockMinutes(block), Long::sum);
                levelTaskCount.merge(levelId, 1, Integer::sum);
            }

            byWeightLevel = weightLevels.stream()
                    .map(wl -> StatisticsResponse.WeightLevelStats.builder()
                            .level(StatisticsResponse.WeightLevel.builder()
                                    .id(wl.getId())
                                    .name(wl.getName())
                                    .weight(wl.getWeight())
                                    .color(wl.getColor())
                                    .position(wl.getPosition())
                                    .is_default(wl.getIsDefault())
                                    .build())
                            .total_minutes(levelMinutes.getOrDefault(wl.getId(), 0L))
                            .task_count(levelTaskCount.getOrDefault(wl.getId(), 0))
                            .build())
                    .collect(Collectors.toList());
        }

        double totalImpactScore = byMember.stream()
                .mapToDouble(StatisticsResponse.MemberImpact::getImpact_score)
                .sum();

        return StatisticsResponse.ImpactStatistics.builder()
                .total_impact_score(totalImpactScore)
                .by_member(byMember)
                .by_weight_level(byWeightLevel)
                .build();
    }

    private List<StatisticsResponse.DailyTrend> calculateDailyTrend(
            List<ScheduleBlock> blocks,
            List<Task> tasks,
            LocalDate startDate,
            LocalDate endDate
    ) {
        Map<LocalDate, Long> totalMinutesByDate = blocks.stream()
                .collect(Collectors.groupingBy(
                        ScheduleBlock::getScheduledDate,
                        Collectors.summingLong(this::getBlockMinutes)
                ));

        Map<LocalDate, Long> completedMinutesByDate = blocks.stream()
                .filter(sb -> sb.getChecklistItem() != null && sb.getChecklistItem().getIsCompleted())
                .collect(Collectors.groupingBy(
                        ScheduleBlock::getScheduledDate,
                        Collectors.summingLong(this::getBlockMinutes)
                ));

        List<StatisticsResponse.DailyTrend> trend = new ArrayList<>();
        for (LocalDate date = startDate; !date.isAfter(endDate); date = date.plusDays(1)) {
            trend.add(StatisticsResponse.DailyTrend.builder()
                    .date(date.format(DateTimeFormatter.ISO_LOCAL_DATE))
                    .total_minutes(totalMinutesByDate.getOrDefault(date, 0L))
                    .completed_minutes(completedMinutesByDate.getOrDefault(date, 0L))
                    .task_completed_count(0) // 간단화
                    .build());
        }

        return trend;
    }

    private long getBlockMinutes(ScheduleBlock block) {
        if (block.getStartTime() == null || block.getEndTime() == null) {
            return 0;
        }
        return Duration.between(block.getStartTime(), block.getEndTime()).toMinutes();
    }
}
