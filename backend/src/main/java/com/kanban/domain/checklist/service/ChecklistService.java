package com.kanban.domain.checklist.service;

import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.checklist.dto.ChecklistRequest;
import com.kanban.domain.checklist.dto.ChecklistResponse;
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

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChecklistService {

    private final ChecklistItemRepository checklistItemRepository;
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;

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
    public ChecklistResponse.Detail createChecklistItem(String boardId, String taskId, String userId, ChecklistRequest.Create request) {
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

        log.info("Checklist item created: {} in task: {} by user: {}", item.getId(), taskId, userId);

        return ChecklistResponse.Detail.of(item);
    }

    @Transactional
    public ChecklistResponse.Detail updateChecklistItem(String boardId, String taskId, String itemId, String userId, ChecklistRequest.Update request) {
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

        item.updateInfo(request.getTitle(), request.getStartDate(), request.getDueDate());

        if (request.getAssigneeId() != null) {
            User assignee = userRepository.findById(request.getAssigneeId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
            item.updateAssignee(assignee);
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

        log.info("Checklist item toggled: {} to {} by user: {}", itemId, item.getIsCompleted(), userId);

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
}
