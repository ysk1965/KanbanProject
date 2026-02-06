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
import com.kanban.domain.milestone.MilestoneFeatureRepository;
import com.kanban.domain.notification.NotificationRepository;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.tag.Tag;
import com.kanban.domain.tag.TaskTag;
import com.kanban.domain.tag.TaskTagRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.task.dto.TaskRequest;
import com.kanban.domain.task.dto.TaskResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.domain.weight.TaskWeightRepository;
import com.kanban.global.service.FileUploadService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.kanban.domain.feature.FeatureStatus;

import java.util.HashMap;
import java.util.HashSet;
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
    private final MilestoneFeatureRepository milestoneFeatureRepository;
    private final ActivityService activityService;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final DailyChecklistRepository dailyChecklistRepository;
    private final TaskWeightRepository taskWeightRepository;
    private final CommentAttachmentRepository commentAttachmentRepository;
    private final CommentRepository commentRepository;
    private final NotificationRepository notificationRepository;
    private final FileUploadService fileUploadService;

    public TaskResponse.ListResponse getTasks(String boardId, String userId, String blockId, String featureId, String milestoneId) {
        boardService.checkViewerOrAbove(boardId, userId);

        // Fetch Join으로 N+1 방지
        List<Task> tasks;
        if (blockId != null) {
            tasks = taskRepository.findByBlockIdWithFetch(blockId);
        } else if (featureId != null) {
            tasks = taskRepository.findByFeatureIdWithFetch(featureId);
        } else {
            tasks = taskRepository.findByBoardIdWithFetch(boardId);
        }

        // 마일스톤 필터 적용: 해당 마일스톤에 속한 Feature의 Task만 필터링
        if (milestoneId != null && !milestoneId.isEmpty()) {
            Set<String> milestoneFeatureIds = new HashSet<>(
                    milestoneFeatureRepository.findFeatureIdsByMilestoneId(milestoneId)
            );
            tasks = tasks.stream()
                    .filter(t -> milestoneFeatureIds.contains(t.getFeature().getId()))
                    .collect(Collectors.toList());
        }

        Map<String, List<Tag>> taskTagsMap = getTaskTagsMap(tasks);
        Map<String, int[]> checklistCountMap = getChecklistCountMap(tasks);

        return TaskResponse.ListResponse.of(tasks, taskTagsMap, checklistCountMap);
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

        Task task = Task.builder()
                .feature(feature)
                .board(board)
                .block(taskBlock)
                .title(request.getTitle())
                .description(request.getDescription())
                .startDate(request.getStartDate())
                .dueDate(request.getDueDate())
                .estimatedMinutes(request.getEstimatedMinutes())
                .position(newPosition)
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
                Map.of(
                        "taskTitle", task.getTitle(),
                        "featureTitle", feature.getTitle(),
                        "featureColor", feature.getColor()
                )
        );

        log.info("Task created: {} in feature: {} by user: {}", task.getId(), featureId, userId);

        return TaskResponse.Detail.of(task, List.of());
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

        User updater = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        activityService.logActivity(task.getBoard(), updater, ActivityAction.TASK_UPDATED, TargetType.TASK, taskId,
                Map.of("taskTitle", task.getTitle()));

        List<Tag> tags = taskTagRepository.findByTaskId(taskId).stream()
                .map(TaskTag::getTag)
                .toList();

        log.info("Task updated: {} by user: {}", taskId, userId);

        return TaskResponse.Detail.of(task, tags);
    }

    @Transactional
    public void deleteTask(String boardId, String taskId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        Feature feature = task.getFeature();

        // 활동 로그 기록 (삭제 전에 기록)
        String taskTitle = task.getTitle();
        User deleter = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        activityService.logActivity(task.getBoard(), deleter, ActivityAction.TASK_DELETED, TargetType.TASK, taskId,
                Map.of("taskTitle", taskTitle, "featureTitle", feature.getTitle()));

        // 완료된 Task였으면 completedTasks 감소
        if (task.getIsCompleted()) {
            feature.decrementCompletedTasks();
        }
        // totalTasks 감소
        feature.decrementTotalTasks();

        // 관련 데이터 삭제 (FK 의존성 순서: leaf → parent)
        // 1) 알림 (task_id는 VARCHAR 참조이지만 orphan 방지)
        notificationRepository.deleteByTaskId(taskId);

        // 2) 스케줄/데일리 (checklist_item_id FK)
        scheduleBlockRepository.deleteByTaskId(taskId);
        dailyChecklistRepository.deleteByTaskId(taskId);

        // 3) 체크리스트 아이템
        checklistItemRepository.deleteByTaskId(taskId);

        // 4) 태그 연결, 가중치
        taskTagRepository.deleteByTaskId(taskId);
        taskWeightRepository.deleteByTaskId(taskId);

        // 5) 댓글 첨부파일 S3 삭제 → 댓글 첨부파일 DB 삭제 → 댓글 삭제
        List<CommentAttachment> attachments = commentAttachmentRepository.findByTaskId(taskId);
        for (CommentAttachment attachment : attachments) {
            fileUploadService.delete(attachment.getS3Key());
        }
        commentAttachmentRepository.deleteByTaskId(taskId);
        commentRepository.deleteByTaskId(taskId);

        // 6) Task 삭제
        taskRepository.delete(task);

        log.info("Task deleted: {} by user: {}", taskId, userId);
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
        if (!oldBlockId.equals(targetBlock.getId())) {
            User user = userRepository.findById(userId)
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

        return TaskResponse.Detail.of(task, tags);
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

    private Map<String, int[]> getChecklistCountMap(List<Task> tasks) {
        Map<String, int[]> result = new HashMap<>();
        for (Task task : tasks) {
            int total = checklistItemRepository.countByTaskId(task.getId());
            int completed = checklistItemRepository.countByTaskIdAndIsCompletedTrue(task.getId());
            result.put(task.getId(), new int[]{total, completed});
        }
        return result;
    }

    /**
     * Standard 보드의 Task 생성 제한 확인
     * Standard 보드는 최대 10개의 Task만 생성 가능
     */
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
