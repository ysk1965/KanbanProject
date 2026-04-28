package com.kanban.domain.trash.service;

import com.kanban.domain.activity.ActivityAction;
import com.kanban.domain.activity.TargetType;
import com.kanban.domain.activity.service.ActivityService;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.checklist.service.ChecklistService;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.feature.service.FeatureService;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.task.service.TaskService;
import com.kanban.domain.trash.dto.TrashResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TrashService {

    public static final int RETENTION_DAYS = 30;

    private final FeatureRepository featureRepository;
    private final TaskRepository taskRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final FeatureService featureService;
    private final TaskService taskService;
    private final ChecklistService checklistService;
    private final ActivityService activityService;
    private final WebSocketEventService webSocketEventService;
    private final EntityManager entityManager;

    public TrashResponse.ListResponse listTrash(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);

        List<TrashResponse.FeatureItem> features = featureRepository.findDeletedByBoardId(boardId).stream()
                .map(TrashResponse.FeatureItem::of)
                .toList();
        List<TrashResponse.TaskItem> tasks = taskRepository.findDeletedByBoardId(boardId).stream()
                .map(TrashResponse.TaskItem::of)
                .toList();
        List<TrashResponse.ChecklistItemItem> checklists = checklistItemRepository.findDeletedByBoardId(boardId).stream()
                .map(TrashResponse.ChecklistItemItem::of)
                .toList();

        return TrashResponse.ListResponse.builder()
                .features(features)
                .tasks(tasks)
                .checklistItems(checklists)
                .retentionDays(RETENTION_DAYS)
                .build();
    }

    // ==================== Restore ====================

    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public void restoreFeature(String boardId, String featureId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);

        Feature feature = featureRepository.findByIdIncludingDeleted(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));
        if (!feature.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.FEATURE_NOT_FOUND);
        }
        if (!feature.isDeleted()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        LocalDateTime ts = feature.getDeletedAt();

        // 1) cascade 복구: 같은 timestamp의 자식 task / checklist만
        checklistItemRepository.restoreByFeatureIdAndDeletedAt(featureId, ts);
        taskRepository.restoreByFeatureIdAndDeletedAt(featureId, ts);

        // 2) Feature 자신 복구 + position 끝번호로 append (충돌 회피)
        feature.restore();
        Integer maxPos = featureRepository.findMaxPositionByBoardId(boardId);
        feature.updatePosition(maxPos == null ? 0 : maxPos + 1);

        entityManager.flush();
        entityManager.clear();

        // 3) counter 재계산 (살아있는 task 기준)
        feature = featureRepository.findById(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));
        int total = taskRepository.countByFeatureId(featureId);
        int completed = taskRepository.countByFeatureIdAndIsCompletedTrue(featureId);
        feature.recalcCounters(total, completed);

        // 4) 활동 로그 + WebSocket
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        activityService.logActivity(feature.getBoard(), user, ActivityAction.FEATURE_RESTORED, TargetType.FEATURE, featureId,
                Map.of("featureTitle", feature.getTitle()));
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.FEATURE_RESTORED, userId, user.getName(),
                Map.of("id", featureId));

        log.info("Feature restored: {} by user: {}", featureId, userId);
    }

    @Transactional
    public void restoreTask(String boardId, String taskId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);

        Task task = taskRepository.findByIdIncludingDeleted(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));
        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }
        if (!task.isDeleted()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        Feature feature = task.getFeature();
        if (feature == null || feature.isDeleted()) {
            // 부모 feature가 삭제되어 있으면 task 단독 복구 불가 (먼저 feature 복구해야)
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        LocalDateTime ts = task.getDeletedAt();

        // 1) cascade 복구: 같은 timestamp의 자식 checklist
        checklistItemRepository.restoreByTaskIdAndDeletedAt(taskId, ts);

        // 2) Task 복구 + position 끝번호로 append
        task.restore();
        Integer maxPos = taskRepository.findMaxPositionByBlockId(task.getBlock().getId());
        task.updatePosition(maxPos == null ? 0 : maxPos + 1);

        // 3) Feature counter 복원 (소프트 삭제 시 decrement했던 만큼 increment)
        feature.incrementTotalTasks();
        if (Boolean.TRUE.equals(task.getIsCompleted())) {
            feature.incrementCompletedTasks();
        }

        // 4) 활동 로그 + WebSocket
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        activityService.logActivity(task.getBoard(), user, ActivityAction.TASK_RESTORED, TargetType.TASK, taskId,
                Map.of("taskTitle", task.getTitle(), "featureTitle", feature.getTitle()));
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.TASK_RESTORED, userId, user.getName(),
                Map.of("id", taskId, "feature_id", feature.getId()));

        log.info("Task restored: {} by user: {}", taskId, userId);
    }

    @Transactional
    public void restoreChecklistItem(String boardId, String itemId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);

        ChecklistItem item = checklistItemRepository.findByIdIncludingDeleted(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));
        Task task = item.getTask();
        if (task == null || !task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }
        if (task.isDeleted() || (task.getFeature() != null && task.getFeature().isDeleted())) {
            // 부모가 삭제되어 있으면 단독 복구 불가
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        if (!item.isDeleted()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        item.restore();
        Integer maxPos = checklistItemRepository.findMaxPositionByTaskId(task.getId());
        item.updatePosition(maxPos == null ? 0 : maxPos + 1);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        activityService.logActivity(task.getBoard(), user, ActivityAction.CHECKLIST_RESTORED, TargetType.CHECKLIST, itemId,
                Map.of("title", item.getTitle(), "taskTitle", task.getTitle()));
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.CHECKLIST_RESTORED, userId, user.getName(),
                Map.of("id", itemId, "task_id", task.getId()));

        log.info("ChecklistItem restored: {} by user: {}", itemId, userId);
    }

    // ==================== Permanent Delete ====================

    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public void permanentlyDeleteFeature(String boardId, String featureId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Feature feature = featureRepository.findByIdIncludingDeleted(featureId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEATURE_NOT_FOUND));
        String title = feature.getTitle();

        featureService.hardDeleteFeature(boardId, featureId);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        activityService.logActivity(board, user, ActivityAction.FEATURE_PERMANENTLY_DELETED, TargetType.FEATURE, featureId,
                Map.of("featureTitle", title));
    }

    @Transactional
    public void permanentlyDeleteTask(String boardId, String taskId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Task task = taskRepository.findByIdIncludingDeleted(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));
        String title = task.getTitle();

        taskService.hardDeleteTask(boardId, taskId);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        activityService.logActivity(board, user, ActivityAction.TASK_PERMANENTLY_DELETED, TargetType.TASK, taskId,
                Map.of("taskTitle", title));
    }

    @Transactional
    public void permanentlyDeleteChecklistItem(String boardId, String itemId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        ChecklistItem item = checklistItemRepository.findByIdIncludingDeleted(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));
        String title = item.getTitle();

        checklistService.hardDeleteChecklistItem(boardId, itemId);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        activityService.logActivity(board, user, ActivityAction.CHECKLIST_PERMANENTLY_DELETED, TargetType.CHECKLIST, itemId,
                Map.of("title", title));
    }

    @Transactional
    @CacheEvict(value = "features", key = "#boardId")
    public void emptyTrash(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);

        List<Feature> features = featureRepository.findDeletedByBoardId(boardId);
        List<Task> tasks = taskRepository.findDeletedByBoardId(boardId);
        List<ChecklistItem> checklists = checklistItemRepository.findDeletedByBoardId(boardId);

        // Order matters: checklist → task → feature (children first to avoid orphan FK issues)
        for (ChecklistItem ci : checklists) {
            try { checklistService.hardDeleteChecklistItem(boardId, ci.getId()); }
            catch (Exception e) { log.error("emptyTrash checklist {}: {}", ci.getId(), e.getMessage()); }
        }
        for (Task t : tasks) {
            try { taskService.hardDeleteTask(boardId, t.getId()); }
            catch (Exception e) { log.error("emptyTrash task {}: {}", t.getId(), e.getMessage()); }
        }
        for (Feature f : features) {
            try { featureService.hardDeleteFeature(boardId, f.getId()); }
            catch (Exception e) { log.error("emptyTrash feature {}: {}", f.getId(), e.getMessage()); }
        }

        log.info("Trash emptied for board: {} by user: {} ({} features, {} tasks, {} checklists)",
                boardId, userId, features.size(), tasks.size(), checklists.size());
    }
}
