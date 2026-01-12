package com.kanban.domain.schedule.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.schedule.ScheduleBlock;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.schedule.dto.ScheduleRequest;
import com.kanban.domain.schedule.dto.ScheduleResponse;
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

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ScheduleService {

    private final ScheduleBlockRepository scheduleBlockRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;

    public ScheduleResponse.DailySchedule getDailySchedule(String boardId, LocalDate date, List<String> assigneeIds, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        List<String> targetAssigneeIds = assigneeIds;
        if (targetAssigneeIds == null || targetAssigneeIds.isEmpty()) {
            targetAssigneeIds = boardMemberRepository.findByBoardId(boardId)
                    .stream()
                    .map(bm -> bm.getUser().getId())
                    .collect(Collectors.toList());
        }

        List<ScheduleBlock> blocks = scheduleBlockRepository
                .findByBoardIdAndScheduledDateAndAssigneeIdInOrderByStartTimeAsc(boardId, date, targetAssigneeIds);

        Map<String, List<ScheduleBlock>> blocksByAssignee = blocks.stream()
                .collect(Collectors.groupingBy(b -> b.getAssignee().getId()));

        List<ScheduleResponse.ColumnInfo> columns = new ArrayList<>();
        for (String assigneeId : targetAssigneeIds) {
            User user = userRepository.findById(assigneeId).orElse(null);
            if (user == null) continue;

            List<ScheduleBlock> userBlocks = blocksByAssignee.getOrDefault(assigneeId, new ArrayList<>());
            List<ScheduleResponse.BlockInfo> blockInfos = userBlocks.stream()
                    .map(ScheduleResponse.BlockInfo::of)
                    .collect(Collectors.toList());

            columns.add(ScheduleResponse.ColumnInfo.builder()
                    .user(ScheduleResponse.UserInfo.of(user))
                    .blocks(blockInfos)
                    .build());
        }

        return ScheduleResponse.DailySchedule.builder()
                .date(date)
                .settings(ScheduleResponse.SettingsInfo.of(board))
                .columns(columns)
                .build();
    }

    @Transactional
    public ScheduleResponse.BlockDetail createScheduleBlock(String boardId, String userId, ScheduleRequest.Create request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User assignee = userRepository.findById(request.getAssigneeId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        ChecklistItem checklistItem = null;
        if (request.getChecklistItemId() != null) {
            checklistItem = checklistItemRepository.findById(request.getChecklistItemId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));
        }

        ScheduleBlock block = ScheduleBlock.builder()
                .board(board)
                .checklistItem(checklistItem)
                .assignee(assignee)
                .scheduledDate(request.getScheduledDate())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .build();

        scheduleBlockRepository.save(block);

        log.info("Schedule block created: {} by user: {}", block.getId(), userId);

        return ScheduleResponse.BlockDetail.of(block);
    }

    @Transactional
    public ScheduleResponse.BlockDetail createWithChecklistItem(String boardId, String userId, ScheduleRequest.CreateWithChecklistItem request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User assignee = userRepository.findById(request.getAssigneeId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Task task = taskRepository.findById(request.getChecklistItem().getTaskId())
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        Integer maxPosition = checklistItemRepository.findMaxPositionByTaskId(task.getId());
        int newPosition = (maxPosition != null) ? maxPosition + 1 : 0;

        ChecklistItem checklistItem = ChecklistItem.builder()
                .task(task)
                .title(request.getChecklistItem().getTitle())
                .assignee(assignee)
                .startDate(request.getChecklistItem().getStartDate())
                .dueDate(request.getChecklistItem().getDueDate())
                .position(newPosition)
                .build();

        checklistItemRepository.save(checklistItem);

        ScheduleBlock block = ScheduleBlock.builder()
                .board(board)
                .checklistItem(checklistItem)
                .assignee(assignee)
                .scheduledDate(request.getScheduledDate())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .build();

        scheduleBlockRepository.save(block);

        log.info("Schedule block created with new checklist item: {} by user: {}", block.getId(), userId);

        return ScheduleResponse.BlockDetail.of(block);
    }

    @Transactional
    public ScheduleResponse.BlockDetail updateScheduleBlock(String boardId, String blockId, String userId, ScheduleRequest.Update request) {
        boardService.checkMemberOrAbove(boardId, userId);

        ScheduleBlock block = scheduleBlockRepository.findById(blockId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULE_BLOCK_NOT_FOUND));

        if (!block.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.SCHEDULE_BLOCK_NOT_FOUND);
        }

        block.updateTimes(request.getStartTime(), request.getEndTime());

        log.info("Schedule block updated: {} by user: {}", blockId, userId);

        return ScheduleResponse.BlockDetail.of(block);
    }

    @Transactional
    public void deleteScheduleBlock(String boardId, String blockId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        ScheduleBlock block = scheduleBlockRepository.findById(blockId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULE_BLOCK_NOT_FOUND));

        if (!block.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.SCHEDULE_BLOCK_NOT_FOUND);
        }

        scheduleBlockRepository.delete(block);

        log.info("Schedule block deleted: {} by user: {}", blockId, userId);
    }

    @Transactional
    public ScheduleResponse.SettingsInfo updateScheduleSettings(String boardId, String userId, ScheduleRequest.UpdateSettings request) {
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        board.updateScheduleSettings(request.getWorkHoursPerDay(), request.getWorkStartTime(), request.getScheduleDisplayMode());

        log.info("Schedule settings updated for board: {} by user: {}", boardId, userId);

        return ScheduleResponse.SettingsInfo.of(board);
    }

    public ScheduleResponse.SettingsInfo getScheduleSettings(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        return ScheduleResponse.SettingsInfo.of(board);
    }
}
