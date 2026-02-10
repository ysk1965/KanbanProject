package com.kanban.domain.checklist.service;

import com.kanban.domain.activity.ActivityAction;
import com.kanban.domain.activity.TargetType;
import com.kanban.domain.activity.service.ActivityService;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.checklist.dto.ChecklistBatchRequest;
import com.kanban.domain.checklist.dto.ChecklistBatchResponse;
import com.kanban.domain.checklist.dto.ChecklistRequest;
import com.kanban.domain.checklist.dto.ChecklistResponse;
import com.kanban.domain.dailychecklist.DailyChecklistRepository;
import com.kanban.domain.integration.slack.service.SlackNotificationService;
import com.kanban.domain.notification.service.NotificationService;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChecklistService {

    private final ChecklistItemRepository checklistItemRepository;
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final DailyChecklistRepository dailyChecklistRepository;
    private final ActivityService activityService;
    private final NotificationService notificationService;
    private final SlackNotificationService slackNotificationService;

    public ChecklistResponse.ListResponse getChecklist(String boardId, String taskId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        List<ChecklistItem> items = checklistItemRepository.findByTaskIdOrderByPositionAsc(taskId);
        return ChecklistResponse.ListResponse.of(items);
    }

    @Transactional
    public ChecklistResponse.Detail createChecklistItem(String boardId, String taskId, String userId, ChecklistRequest.Create request, String originUrl) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        User assignee = null;
        if (request.getAssigneeId() != null) {
            assignee = userRepository.findById(request.getAssigneeId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        }

        Integer maxPosition = checklistItemRepository.findMaxPositionByTaskId(taskId);
        int newPosition = (maxPosition != null) ? maxPosition + 1 : 0;

        ChecklistItem item = ChecklistItem.builder()
                .task(task)
                .title(request.getTitle())
                .assignee(assignee)
                .startDate(request.getStartDate())
                .dueDate(request.getDueDate())
                .position(newPosition)
                .build();

        checklistItemRepository.save(item);

        // 활동 로그 기록
        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        activityService.logActivity(
                task.getBoard(),
                creator,
                ActivityAction.CHECKLIST_CREATED,
                TargetType.CHECKLIST,
                item.getId(),
                Map.of(
                        "checklistTitle", item.getTitle(),
                        "taskTitle", task.getTitle()
                )
        );

        // 배정자가 있으면 알림 발송
        if (assignee != null) {
            notificationService.createChecklistAssignedNotification(item, creator, task.getBoard());
            slackNotificationService.sendChecklistAssignedNotification(item, creator, task.getBoard(), originUrl);
        }

        log.info("Checklist item created: {} in task: {} by user: {}", item.getId(), taskId, userId);

        return ChecklistResponse.Detail.of(item);
    }

    @Transactional
    public ChecklistResponse.Detail updateChecklistItem(String boardId, String taskId, String itemId, String userId, ChecklistRequest.Update request, String originUrl) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        if (!item.getTask().getId().equals(taskId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }

        String oldAssigneeId = item.getAssignee() != null ? item.getAssignee().getId() : null;

        item.updateInfo(request.getTitle(), request.getStartDate(), request.getDueDate());

        if (request.getAssigneeId() != null) {
            User assignee = userRepository.findById(request.getAssigneeId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
            item.updateAssignee(assignee);

            // 배정자가 변경된 경우 알림 발송
            if (!request.getAssigneeId().equals(oldAssigneeId)) {
                User assigner = userRepository.findById(userId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
                notificationService.createChecklistAssignedNotification(item, assigner, task.getBoard());
                slackNotificationService.sendChecklistAssignedNotification(item, assigner, task.getBoard(), originUrl);
            }
        }

        log.info("Checklist item updated: {} by user: {}", itemId, userId);

        return ChecklistResponse.Detail.of(item);
    }

    @Transactional
    public void deleteChecklistItem(String boardId, String taskId, String itemId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        if (!item.getTask().getId().equals(taskId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }

        // 연관된 데일리 체크리스트 연결 해제
        dailyChecklistRepository.unlinkByChecklistItemId(itemId);

        // 연관된 스케줄 블록 삭제
        scheduleBlockRepository.deleteByChecklistItemId(itemId);

        checklistItemRepository.delete(item);

        log.info("Checklist item deleted: {} by user: {}", itemId, userId);
    }

    @Transactional
    public ChecklistResponse.Detail toggleChecklistItem(String boardId, String taskId, String itemId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        if (!item.getTask().getId().equals(taskId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }

        item.toggle();
        checklistItemRepository.save(item);

        log.info("Checklist item toggled: {} to {} by user: {}", itemId, item.getIsCompleted(), userId);

        // 액티비티 로깅은 별도 트랜잭션으로 실행 (실패해도 토글에 영향 없음)
        try {
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
            activityService.logActivityInNewTransaction(task.getBoard(), user, ActivityAction.CHECKLIST_CHECKED, TargetType.CHECKLIST, itemId,
                    Map.of("checklistTitle", item.getTitle(), "taskTitle", task.getTitle(), "isCompleted", item.getIsCompleted()));
        } catch (Exception e) {
            log.warn("Failed to log checklist toggle activity for item: {}", itemId, e);
        }

        return ChecklistResponse.Detail.of(item);
    }

    @Transactional
    public ChecklistResponse.Detail moveChecklistItemToTask(String boardId, String taskId, String itemId, String userId, ChecklistRequest.MoveTask request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Task sourceTask = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!sourceTask.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        if (!item.getTask().getId().equals(taskId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }

        Task targetTask = taskRepository.findById(request.getTargetTaskId())
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!targetTask.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        // 같은 Task로의 이동은 무시
        if (sourceTask.getId().equals(targetTask.getId())) {
            return ChecklistResponse.Detail.of(item);
        }

        // 대상 Task에서 마지막 position 계산
        Integer maxPosition = checklistItemRepository.findMaxPositionByTaskId(targetTask.getId());
        int newPosition = (maxPosition != null) ? maxPosition + 1 : 0;

        item.moveToTask(targetTask, newPosition);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        activityService.logActivity(sourceTask.getBoard(), user, ActivityAction.CHECKLIST_MOVED, TargetType.CHECKLIST, item.getId(),
                Map.of("checklistTitle", item.getTitle(),
                        "fromTask", sourceTask.getTitle(),
                        "toTask", targetTask.getTitle()));

        log.info("Checklist item moved: {} from task {} to task {} by user: {}",
                itemId, taskId, targetTask.getId(), userId);

        return ChecklistResponse.Detail.of(item);
    }

    public ChecklistResponse.BoardListResponse getBoardChecklistItems(String boardId, String userId, String assigneeId, Boolean isScheduled) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<ChecklistItem> items;

        if (isScheduled != null && !isScheduled) {
            if (assigneeId != null) {
                items = checklistItemRepository.findUnscheduledByBoardIdAndAssigneeId(boardId, assigneeId);
            } else {
                items = checklistItemRepository.findUnscheduledByBoardId(boardId);
            }
        } else {
            if (assigneeId != null) {
                items = checklistItemRepository.findByBoardIdAndAssigneeId(boardId, assigneeId);
            } else {
                items = checklistItemRepository.findByBoardId(boardId);
            }
        }

        return ChecklistResponse.BoardListResponse.of(items);
    }

    /**
     * 여러 Task의 체크리스트를 일괄 조회
     * IN 쿼리를 사용하여 N+1 문제 방지
     */
    public ChecklistBatchResponse getBatchChecklists(String boardId, String userId, ChecklistBatchRequest request) {
        boardService.checkViewerOrAbove(boardId, userId);

        if (request.getTaskIds() == null || request.getTaskIds().isEmpty()) {
            return ChecklistBatchResponse.builder()
                    .checklists(List.of())
                    .build();
        }

        // IN 쿼리로 한 번에 조회 (N+1 방지)
        List<ChecklistItem> items = checklistItemRepository.findByTaskIdIn(request.getTaskIds());

        // 해당 보드에 속한 체크리스트만 필터링
        List<ChecklistItem> filteredItems = items.stream()
                .filter(item -> item.getTask().getBoard().getId().equals(boardId))
                .toList();

        return ChecklistBatchResponse.of(filteredItems);
    }
}
