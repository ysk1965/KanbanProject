package com.kanban.domain.task.service;

import com.kanban.domain.activity.ActivityAction;
import com.kanban.domain.activity.TargetType;
import com.kanban.domain.activity.service.ActivityService;
import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.comment.CommentAttachment;
import com.kanban.domain.comment.CommentAttachmentRepository;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.dailychecklist.DailyChecklistRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneFeature;
import com.kanban.domain.milestone.MilestoneFeatureRepository;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.notification.NotificationRepository;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.tag.Tag;
import com.kanban.domain.tag.TaskTag;
import com.kanban.domain.tag.TaskTagRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.task.dto.TaskKeyResponse;
import com.kanban.domain.task.dto.TaskRequest;
import com.kanban.domain.task.dto.TaskResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.domain.weight.TaskWeightRepository;
import com.kanban.global.service.FileUploadService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.kanban.domain.feature.FeatureStatus;

import com.kanban.domain.checklist.ChecklistItem;
import jakarta.persistence.EntityManager;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TaskService {

    private final TaskRepository taskRepository;
    private final TaskTagRepository taskTagRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final FeatureRepository featureRepository;
    private final BlockRepository blockRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final TaskKeyAllocator taskKeyAllocator;
    private final MilestoneFeatureRepository milestoneFeatureRepository;
    private final MilestoneRepository milestoneRepository;
    private final ActivityService activityService;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final DailyChecklistRepository dailyChecklistRepository;
    private final TaskWeightRepository taskWeightRepository;
    private final CommentAttachmentRepository commentAttachmentRepository;
    private final CommentRepository commentRepository;
    private final NotificationRepository notificationRepository;
    private final FileUploadService fileUploadService;
    private final WebSocketEventService webSocketEventService;
    private final EntityManager entityManager;
    private final org.springframework.context.ApplicationEventPublisher eventPublisher;

    public TaskResponse.ListResponse getTasks(String boardId, String userId, String blockId, String featureId, String milestoneId) {
        // 뷰어 이상 권한 확인 (컨트롤러 경로 전용 — Facade는 멤버십을 1회 검증 후 internal 직접 호출)
        boardService.checkViewerOrAbove(boardId, userId);
        return getTasksInternal(boardId, blockId, featureId, milestoneId);
    }

    /** 권한 검증 없는 내부 조회 (BoardFacadeService처럼 호출 측에서 이미 멤버십을 검증한 경우 사용) */
    public TaskResponse.ListResponse getTasksInternal(String boardId, String blockId, String featureId, String milestoneId) {
        // Fetch Join으로 N+1 방지
        List<Task> tasks;
        if (blockId != null) {
            tasks = taskRepository.findByBlockIdWithFetch(blockId);
        } else if (featureId != null) {
            tasks = taskRepository.findByFeatureIdWithFetch(featureId);
        } else {
            tasks = taskRepository.findByBoardIdWithFetch(boardId);
        }

        // 마일스톤 필터 적용: 태스크에 직접 배정된 마일스톤 기준
        if (milestoneId != null && !milestoneId.isEmpty()) {
            if ("none".equals(milestoneId)) {
                // 마일스톤 미배정 태스크만
                tasks = tasks.stream()
                        .filter(t -> t.getMilestone() == null)
                        .collect(Collectors.toList());
            } else {
                tasks = tasks.stream()
                        .filter(t -> t.getMilestone() != null && milestoneId.equals(t.getMilestone().getId()))
                        .collect(Collectors.toList());
            }
        }

        Map<String, List<Tag>> taskTagsMap = getTaskTagsMap(tasks);
        ChecklistMaps checklistMaps = getChecklistMaps(tasks);

        return TaskResponse.ListResponse.of(tasks, taskTagsMap, checklistMaps.countMap, checklistMaps.assigneesMap);
    }

    public TaskResponse.Detail getTask(String boardId, String taskId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        // Fetch Join으로 N+1 방지
        List<Tag> tags = taskTagRepository.findByTaskIdWithFetch(taskId).stream()
                .map(TaskTag::getTag)
                .toList();

        return TaskResponse.Detail.of(task, tags);
    }

    /**
     * 사람이 읽는 태스크 키(예: STORY-42)를 보드/태스크 ID로 해석한다.
     * 키는 대소문자 무시, 조회 후 보드 뷰어 이상 권한을 검증한다.
     */
    public TaskKeyResponse resolveTaskKey(String key, String userId) {
        String normalized = key == null ? "" : key.trim().toUpperCase();
        Task task = taskRepository.findByTaskKey(normalized)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        String boardId = task.getBoard().getId();
        boardService.checkViewerOrAbove(boardId, userId);

        return new TaskKeyResponse(boardId, task.getId());
    }

    @Transactional
    public TaskResponse.Detail createTask(String boardId, String featureId, String userId, TaskRequest.Create request) {
        boardService.checkMemberOrAbove(boardId, userId);

        // Pessimistic Lock으로 Board 조회 - Task 제한 동시성 제어
        Board board = boardRepository.findByIdWithLock(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // Trial 만료 체크 및 자동 전환
        board.checkAndUpdateTierIfTrialExpired();

        // Standard 보드의 Task 제한 확인
        validateTaskLimit(board);

        Feature feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

        if (!feature.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
        }

        // Task 블록 찾기 (새 Task는 Task 블록에 생성)
        Block taskBlock = blockRepository.findByBoardIdAndFixedType(boardId, FixedBlockType.TASK)
                .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));

        // Pessimistic Lock으로 Block 조회 - position 동시성 제어
        blockRepository.findByIdWithLock(taskBlock.getId());

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // Lock 획득 후 position 조회 - 동시성 안전
        Integer maxPosition = taskRepository.findMaxPositionByBlockId(taskBlock.getId());
        int newPosition = (maxPosition != null) ? maxPosition + 1 : 0;

        // 피처 내 표시 순서: 맨 끝에 추가
        Integer maxFeaturePosition = taskRepository.findMaxFeaturePositionByFeatureId(featureId);
        int newFeaturePosition = (maxFeaturePosition != null) ? maxFeaturePosition + 1 : 0;

        // 사람이 읽는 키 발급 (보드 락 구간 안 — 프리픽스 없으면 파생·할당 후 번호 원자적 증가)
        if (board.getKeyPrefix() == null || board.getKeyPrefix().isBlank()) {
            board.assignKeyPrefixIfAbsent(taskKeyAllocator.allocateUniquePrefix(board.getName()));
        }
        int taskNumber = board.nextTaskNumber();
        String taskKey = board.getKeyPrefix() + "-" + taskNumber;

        // 마일스톤 결정: 명시 요청이 있으면 그것(필요 시 피처 자동 연결), 없으면 피처의 대표 마일스톤
        Milestone milestone;
        if (request.getMilestoneId() != null && !request.getMilestoneId().isEmpty()) {
            milestone = resolveAndLinkMilestone(board, feature, request.getMilestoneId());
        } else {
            milestone = featurePrimaryMilestone(feature.getId());
        }

        Task task = Task.builder()
                .feature(feature)
                .board(board)
                .block(taskBlock)
                .milestone(milestone)
                .title(request.getTitle())
                .description(request.getDescription())
                .startDate(request.getStartDate())
                .dueDate(request.getDueDate())
                .estimatedMinutes(request.getEstimatedMinutes())
                .position(newPosition)
                .featurePosition(newFeaturePosition)
                .taskNumber(taskNumber)
                .taskKey(taskKey)
                .createdBy(creator)
                .build();

        taskRepository.save(task);

        // Feature의 totalTasks 증가
        feature.incrementTotalTasks();

        // 활동 로그 기록
        activityService.logActivity(
                board,
                creator,
                ActivityAction.TASK_CREATED,
                TargetType.TASK,
                task.getId(),
                // Map.of 는 null 값을 허용하지 않는다 — 색이 없는 피처에 태스크를 만들면 NPE.
                // FeatureService.createFeature 와 같은 방식으로 막는다.
                Map.of(
                        "taskTitle", task.getTitle(),
                        "featureTitle", feature.getTitle(),
                        "featureColor", feature.getColor() != null ? feature.getColor() : ""
                )
        );

        log.info("Task created: {} in feature: {} by user: {}", task.getId(), featureId, userId);

        TaskResponse.Detail response = TaskResponse.Detail.of(task, List.of());
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.TASK_CREATED, userId, creator.getName(),
                Map.of("task", response, "feature", buildFeatureSummary(feature)));
        return response;
    }

    @Transactional
    public TaskResponse.Detail updateTask(String boardId, String taskId, String userId, TaskRequest.Update request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        task.updateInfo(
                request.getTitle(),
                request.getDescription(),
                request.getStartDate(),
                request.getDueDate(),
                request.getEstimatedMinutes()
        );

        // 마일스톤 재배정: null(미전달)이면 변경 없음, ""이면 해제, 값이면 배정(필요 시 피처 자동 연결)
        if (request.getMilestoneId() != null) {
            Milestone oldMilestone = task.getMilestone();
            Milestone milestone = request.getMilestoneId().isEmpty()
                    ? null
                    : resolveAndLinkMilestone(task.getBoard(), task.getFeature(), request.getMilestoneId());
            task.assignMilestone(milestone);
            // 옛 마일스톤에 이 피처의 태스크가 하나도 남지 않으면 비게 된 피처-마일스톤 링크 정리
            if (oldMilestone != null && !oldMilestone.equals(milestone)) {
                cleanupEmptyMilestoneLink(task.getFeature(), oldMilestone);
            }
        }

        User updater = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        activityService.logActivity(task.getBoard(), updater, ActivityAction.TASK_UPDATED, TargetType.TASK, taskId,
                Map.of("taskTitle", task.getTitle()));

        List<Tag> tags = taskTagRepository.findByTaskId(taskId).stream()
                .map(TaskTag::getTag)
                .toList();

        log.info("Task updated: {} by user: {}", taskId, userId);

        TaskResponse.Detail response = TaskResponse.Detail.of(task, tags);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.TASK_UPDATED, userId, updater.getName(), response);
        return response;
    }

    /**
     * 소프트 삭제: Task와 자식 ChecklistItem에 동일 timestamp의 deleted_at을 마킹.
     * 자식 데이터(댓글/첨부/스케줄/태그)는 그대로 유지 → 휴지통에서 복구 시 함께 살아남.
     */
    @Transactional
    public void deleteTask(String boardId, String taskId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        Feature feature = task.getFeature();
        Milestone milestone = task.getMilestone(); // 삭제 후 유령 링크 정리에 사용

        // 활동 로그 기록
        String taskTitle = task.getTitle();
        User deleter = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        activityService.logActivity(task.getBoard(), deleter, ActivityAction.TASK_DELETED, TargetType.TASK, taskId,
                Map.of("taskTitle", taskTitle, "featureTitle", feature.getTitle()));

        // Feature 카운터 감소 (복구 시 increment 되돌림)
        if (task.getIsCompleted()) {
            feature.decrementCompletedTasks();
        }
        feature.decrementTotalTasks();

        // 부모-자식 timestamp 통일
        LocalDateTime deletedAt = LocalDateTime.now(ZoneOffset.UTC);

        // 1) 자식 ChecklistItem 일괄 소프트 삭제
        checklistItemRepository.softDeleteByTaskId(taskId, deletedAt, userId);

        // 2) Task 자체 소프트 삭제
        task.softDelete(userId, deletedAt);

        entityManager.flush();
        entityManager.clear();

        // 삭제된 태스크가 (feature, milestone) 조합의 마지막이었다면 유령 링크 정리
        // (soft-delete + flush 후 조회 → @SQLRestriction으로 방금 삭제한 태스크는 제외됨)
        cleanupEmptyMilestoneLink(feature, milestone);

        log.info("Task soft-deleted: {} by user: {}", taskId, userId);

        // Feature가 영속화 컨텍스트에서 분리됐을 수 있으므로 재조회 후 summary
        Feature freshFeature = featureRepository.findById(feature.getId())
                .orElse(feature);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.TASK_DELETED, userId, deleter.getName(),
                Map.of("id", taskId, "feature", buildFeatureSummary(freshFeature)));
    }

    /**
     * 영구삭제: 자식 데이터(댓글/첨부/S3/스케줄/태그/체크리스트) 전부 정리 후 Task row 삭제.
     * soft-deleted 상태든 활성 상태든 동작.
     */
    @Transactional
    public void hardDeleteTask(String boardId, String taskId) {
        Task task = taskRepository.findByIdIncludingDeleted(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        Feature feature = task.getFeature();
        Milestone milestone = task.getMilestone(); // 삭제 후 유령 링크 정리에 사용

        // 1) 알림
        notificationRepository.deleteByTaskId(taskId);

        // 2) 스케줄/데일리
        scheduleBlockRepository.unlinkByTaskId(taskId);
        dailyChecklistRepository.deleteByTaskId(taskId);

        // 3) 체크리스트 (native: deleted 포함)
        checklistItemRepository.deleteByTaskId(taskId);

        // 4) 태그/가중치
        taskTagRepository.deleteByTaskId(taskId);
        taskWeightRepository.deleteByTaskId(taskId);

        // 5) 댓글 첨부파일 S3 → DB → 댓글
        List<CommentAttachment> attachments = commentAttachmentRepository.findByTaskId(taskId);
        for (CommentAttachment attachment : attachments) {
            fileUploadService.delete(attachment.getS3Key());
        }
        commentAttachmentRepository.deleteByTaskId(taskId);
        commentRepository.deleteByTaskId(taskId);

        // 6) Task row 삭제
        taskRepository.delete(task);
        entityManager.flush();

        // 삭제된 태스크가 (feature, milestone) 조합의 마지막이었다면 유령 링크 정리
        cleanupEmptyMilestoneLink(feature, milestone);

        log.info("Task hard-deleted: {}", taskId);
    }

    @Transactional
    public TaskResponse.Detail moveTask(String boardId, String taskId, String userId, TaskRequest.Move request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        Block targetBlock = blockRepository.findById(request.getTargetBlockId())
                .orElseThrow(() -> new BusinessException(ErrorCode.BLOCK_NOT_FOUND));

        // Feature 블록으로는 이동 불가
        if (targetBlock.isFeatureBlock()) {
            throw new BusinessException(ErrorCode.TASK_INVALID_BLOCK);
        }

        Block oldBlock = task.getBlock();
        String oldBlockId = oldBlock.getId();
        String oldBlockName = oldBlock.getName();
        FeatureStatus featureStatusBefore = task.getFeature().getStatus();
        task.moveToBlock(targetBlock);

        // position 처리 - 블록 내 모든 task의 position을 정규화
        int targetPosition;
        if (request.getPosition() != null) {
            targetPosition = request.getPosition();
        } else {
            // position이 없으면 맨 끝에 추가
            int count = (int) taskRepository.findByBlockIdOrderByPositionAsc(targetBlock.getId())
                    .stream().filter(t -> !t.getId().equals(taskId)).count();
            targetPosition = count;
        }

        // 해당 블록의 모든 task를 가져와서 정렬 (현재 task 제외)
        List<Task> tasksInBlock = taskRepository.findByBlockIdOrderByPositionAsc(targetBlock.getId())
                .stream()
                .filter(t -> !t.getId().equals(taskId))
                .collect(Collectors.toList());

        // targetPosition 위치에 현재 task 삽입
        if (targetPosition > tasksInBlock.size()) {
            targetPosition = tasksInBlock.size();
        }
        tasksInBlock.add(targetPosition, task);

        // position을 0, 1, 2, 3... 으로 재정규화
        for (int i = 0; i < tasksInBlock.size(); i++) {
            tasksInBlock.get(i).updatePosition(i);
        }

        List<Tag> tags = taskTagRepository.findByTaskId(taskId).stream()
                .map(TaskTag::getTag)
                .toList();

        // 블록이 변경된 경우에만 활동 로그 기록
        User user = null;
        if (!oldBlockId.equals(targetBlock.getId())) {
            user = userRepository.findById(userId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

            // Done 블록으로 이동 시 TASK_COMPLETED 로그
            if (targetBlock.isDoneBlock()) {
                activityService.logActivity(task.getBoard(), user, ActivityAction.TASK_COMPLETED, TargetType.TASK, task.getId(),
                        Map.of("taskTitle", task.getTitle(), "featureTitle", task.getFeature().getTitle()));

                // Feature의 모든 Task가 완료되면 FEATURE_COMPLETED 로그
                Feature feature = task.getFeature();
                if (featureStatusBefore != FeatureStatus.COMPLETED && feature.getStatus() == FeatureStatus.COMPLETED) {
                    activityService.logActivity(task.getBoard(), user, ActivityAction.FEATURE_COMPLETED, TargetType.FEATURE, feature.getId(),
                            Map.of("featureTitle", feature.getTitle()));
                }
            } else {
                activityService.logActivity(task.getBoard(), user, ActivityAction.TASK_MOVED, TargetType.TASK, task.getId(),
                        Map.of("taskTitle", task.getTitle(), "fromBlock", oldBlockName, "toBlock", targetBlock.getName()));
            }
        }

        log.info("Task moved: {} from block {} to block {} by user: {}", taskId, oldBlockId, targetBlock.getId(), userId);

        TaskResponse.Detail response = TaskResponse.Detail.of(task, tags);
        if (user == null) {
            user = userRepository.findById(userId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        }
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.TASK_MOVED, userId, user.getName(),
                Map.of("task", response, "feature", buildFeatureSummary(task.getFeature())));

        // JIRA 연동 카드면 블록 변경을 push (커밋 후 비동기). core→jira 역의존 회피용 이벤트.
        if (!oldBlockId.equals(targetBlock.getId())) {
            eventPublisher.publishEvent(
                new com.kanban.domain.task.event.TaskBlockChangedEvent(boardId, taskId, targetBlock.getId()));
        }
        return response;
    }

    @Transactional
    public TaskResponse.Detail moveTaskToFeature(String boardId, String taskId, String userId, TaskRequest.MoveFeature request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        Feature targetFeature = featureRepository.findById(request.getTargetFeatureId())
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

        if (!targetFeature.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
        }

        // 같은 Feature로의 이동은 무시
        if (task.getFeature().getId().equals(targetFeature.getId())) {
            List<Tag> tags = taskTagRepository.findByTaskId(taskId).stream()
                    .map(TaskTag::getTag)
                    .toList();
            return TaskResponse.Detail.of(task, tags);
        }

        Feature oldFeature = task.getFeature();
        Milestone oldMilestone = task.getMilestone();
        String oldFeatureTitle = oldFeature.getTitle();
        task.moveToFeature(targetFeature);

        // 새 피처의 서브태스크 리스트 맨 끝에 추가
        Integer maxFeaturePosition = taskRepository.findMaxFeaturePositionByFeatureId(targetFeature.getId());
        task.updateFeaturePosition((maxFeaturePosition != null) ? maxFeaturePosition + 1 : 0);

        // 이동 전 마일스톤을 유지. 대상 피처에 해당 마일스톤 링크가 없으면 자동 연결(continuation)하여 불변식 유지.
        // (oldMilestone 이 null 이면 그대로 미지정 유지 — moveToFeature 가 이미 null 로 설정)
        if (oldMilestone != null) {
            task.assignMilestone(resolveAndLinkMilestone(task.getBoard(), targetFeature, oldMilestone.getId()));
        }

        // 옛 피처의 옛 마일스톤에 남은 태스크가 없으면 비게 된 피처-마일스톤 링크 정리
        cleanupEmptyMilestoneLink(oldFeature, oldMilestone);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        activityService.logActivity(task.getBoard(), user, ActivityAction.TASK_FEATURE_MOVED, TargetType.TASK, task.getId(),
                Map.of("taskTitle", task.getTitle(),
                        "fromFeature", oldFeatureTitle,
                        "toFeature", targetFeature.getTitle(),
                        // 위와 같은 이유 — Map.of 는 null 을 허용하지 않는다
                        "toFeatureColor", targetFeature.getColor() != null ? targetFeature.getColor() : ""));

        List<Tag> tags = taskTagRepository.findByTaskId(taskId).stream()
                .map(TaskTag::getTag)
                .toList();

        log.info("Task moved to feature: {} from feature {} to feature {} by user: {}",
                taskId, oldFeatureTitle, targetFeature.getTitle(), userId);

        return TaskResponse.Detail.of(task, tags);
    }

    @Transactional
    public void reorderFeatureTasks(String boardId, String featureId, String userId, TaskRequest.ReorderFeatureTasks request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Feature feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));

        if (!feature.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
        }

        List<Task> featureTasks = taskRepository.findByFeatureIdOrderByPositionAsc(featureId);
        Map<String, Task> taskMap = featureTasks.stream()
                .collect(Collectors.toMap(Task::getId, t -> t));

        List<String> taskIds = request.getTaskIds();
        for (String id : taskIds) {
            if (!taskMap.containsKey(id)) {
                throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
            }
        }
        if (taskIds.size() != featureTasks.size()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        for (int i = 0; i < taskIds.size(); i++) {
            taskMap.get(taskIds.get(i)).updateFeaturePosition(i);
        }

        log.info("Feature tasks reordered: feature {} in board {} by user: {}", featureId, boardId, userId);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.TASKS_REORDERED, userId, user.getName(),
                Map.of("feature_id", featureId, "task_ids", taskIds));
    }

    @Transactional
    public TaskResponse.Detail updateTaskDates(String boardId, String taskId, String userId, TaskRequest.UpdateDates request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        task.updateDates(request.getStartDate(), request.getEndDate());

        List<Tag> tags = taskTagRepository.findByTaskId(taskId).stream()
                .map(TaskTag::getTag)
                .toList();

        log.info("Task dates updated: {} (start: {}, end: {}) by user: {}",
                taskId, request.getStartDate(), request.getEndDate(), userId);

        return TaskResponse.Detail.of(task, tags);
    }

    private Map<String, List<Tag>> getTaskTagsMap(List<Task> tasks) {
        if (tasks.isEmpty()) return Map.of();

        List<String> taskIds = tasks.stream().map(Task::getId).toList();
        // Fetch Join으로 N+1 방지
        List<TaskTag> taskTags = taskTagRepository.findByTaskIdInWithFetch(taskIds);

        return taskTags.stream()
                .collect(Collectors.groupingBy(
                        tt -> tt.getTask().getId(),
                        Collectors.mapping(TaskTag::getTag, Collectors.toList())
                ));
    }

    private record ChecklistMaps(
            Map<String, int[]> countMap,
            Map<String, List<TaskResponse.AssigneeInfo>> assigneesMap
    ) {}

    private ChecklistMaps getChecklistMaps(List<Task> tasks) {
        Map<String, int[]> countMap = new HashMap<>();
        Map<String, List<TaskResponse.AssigneeInfo>> assigneesMap = new HashMap<>();

        if (tasks.isEmpty()) return new ChecklistMaps(countMap, assigneesMap);

        List<String> taskIds = tasks.stream().map(Task::getId).toList();
        List<ChecklistItem> allItems = checklistItemRepository.findByTaskIdIn(taskIds);

        Map<String, List<ChecklistItem>> grouped = allItems.stream()
                .collect(Collectors.groupingBy(ci -> ci.getTask().getId()));

        for (Map.Entry<String, List<ChecklistItem>> entry : grouped.entrySet()) {
            String taskId = entry.getKey();
            List<ChecklistItem> items = entry.getValue();

            int total = items.size();
            int completed = (int) items.stream().filter(ChecklistItem::getIsCompleted).count();
            countMap.put(taskId, new int[]{total, completed});

            List<TaskResponse.AssigneeInfo> assignees = items.stream()
                    .filter(ci -> ci.getAssignee() != null)
                    .collect(Collectors.toMap(
                            ci -> ci.getAssignee().getId(),
                            ci -> ci.getAssignee(),
                            (existing, replacement) -> existing,
                            LinkedHashMap::new))
                    .values().stream()
                    .map(TaskResponse.AssigneeInfo::of)
                    .toList();
            if (!assignees.isEmpty()) {
                assigneesMap.put(taskId, assignees);
            }
        }

        return new ChecklistMaps(countMap, assigneesMap);
    }

    @Transactional
    public void saveBaseline(String boardId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        List<Task> tasks = taskRepository.findByBoardIdOrderByPositionAsc(boardId);
        for (Task task : tasks) {
            task.saveBaseline();
        }

        log.info("Baseline saved for board: {} by user: {} ({} tasks)", boardId, userId, tasks.size());
    }

    @Transactional
    public void clearBaseline(String boardId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        List<Task> tasks = taskRepository.findByBoardIdOrderByPositionAsc(boardId);
        for (Task task : tasks) {
            task.clearBaseline();
        }

        log.info("Baseline cleared for board: {} by user: {}", boardId, userId);
    }

    /**
     * Standard 보드의 Task 생성 제한 확인
     * Standard 보드는 최대 10개의 Task만 생성 가능
     */
    private Map<String, Object> buildFeatureSummary(Feature feature) {
        return Map.of(
                "id", feature.getId(),
                "total_tasks", feature.getTotalTasks(),
                "completed_tasks", feature.getCompletedTasks(),
                "progress_percentage", feature.getProgressPercentage()
        );
    }

    /** 피처의 홈(대표) 마일스톤 — 연결된 마일스톤 중 가장 이른 시작일(동률 시 마일스톤 id). 없으면 null. */
    private Milestone featurePrimaryMilestone(String featureId) {
        return milestoneFeatureRepository.findByFeatureIdOrderByMilestoneStartDate(featureId)
                .stream().findFirst()
                .map(MilestoneFeature::getMilestone)
                .orElse(null);
    }

    /**
     * 마일스톤을 로드·검증하고, 피처가 아직 연결돼 있지 않으면 자동으로 연결(continuation)한다.
     * 홈(대표) 여부는 저장하지 않으므로 링크만 추가하면 된다.
     */
    private Milestone resolveAndLinkMilestone(Board board, Feature feature, String milestoneId) {
        Milestone milestone = milestoneRepository.findById(milestoneId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_NOT_FOUND));
        if (!milestone.getBoard().getId().equals(board.getId())) {
            throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
        }
        if (milestoneFeatureRepository.findByMilestoneIdAndFeatureId(milestone.getId(), feature.getId()).isEmpty()) {
            milestoneFeatureRepository.save(MilestoneFeature.create(milestone, feature));
        }
        return milestone;
    }

    /**
     * 태스크가 (feature, milestone) 조합에서 빠져나간 뒤, 그 조합에 남은 (미삭제) 태스크가 없으면
     * 태스크로 인해 생겼던 피처-마일스톤 링크를 정리한다. (마일스톤 필터의 "유령 카드" 방지)
     * <p>호출 규약: task의 milestone/feature 재배정을 마친 뒤(옛 값을 인자로) 호출한다.
     * 남은 태스크 조회는 JPA auto-flush로 방금 옮긴 태스크가 제외된 상태에서 수행된다.
     */
    private void cleanupEmptyMilestoneLink(Feature feature, Milestone milestone) {
        if (feature == null || milestone == null) {
            return;
        }
        // 이 피처의 태스크가 아직 해당 마일스톤에 남아있으면 링크 유지
        if (!taskRepository.findByFeatureIdAndMilestoneId(feature.getId(), milestone.getId()).isEmpty()) {
            return;
        }
        MilestoneFeature link = milestoneFeatureRepository
                .findByMilestoneIdAndFeatureId(milestone.getId(), feature.getId())
                .orElse(null);
        if (link == null) {
            return;
        }
        // 홈(대표)은 저장값이 아니라 파생이므로 링크만 지우면 남은 링크에서 자동으로 새 홈이 계산된다.
        milestoneFeatureRepository.delete(link);

        log.info("Removed empty milestone-feature link: feature {} <-> milestone {}",
                feature.getId(), milestone.getId());
    }

    private void validateTaskLimit(Board board) {
        Integer taskLimit = board.getTaskLimit();
        if (taskLimit != null) {
            int currentTaskCount = taskRepository.countByBoardId(board.getId());
            if (currentTaskCount >= taskLimit) {
                log.warn("Task limit exceeded for board: {} (current: {}, limit: {})",
                        board.getId(), currentTaskCount, taskLimit);
                throw new BusinessException(ErrorCode.TASK_LIMIT_EXCEEDED);
            }
        }
    }
}
