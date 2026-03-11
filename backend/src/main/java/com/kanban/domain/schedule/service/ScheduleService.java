package com.kanban.domain.schedule.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.meeting.MeetingRepository;
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
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    private final MeetingRepository meetingRepository;
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final WebSocketEventService webSocketEventService;

    public ScheduleResponse.DailySchedule getDailySchedule(String boardId, LocalDate date, List<String> assigneeIds, String userId, boolean includeOrgSchedules) {
        boardService.checkViewerOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        validateScheduleAccess(board);

        Map<String, User> userCache = new java.util.HashMap<>();
        List<String> targetAssigneeIds = assigneeIds;
        if (targetAssigneeIds == null || targetAssigneeIds.isEmpty()) {
            var members = boardMemberRepository.findByBoardId(boardId);
            targetAssigneeIds = members.stream().map(bm -> bm.getUser().getId()).collect(Collectors.toList());
            members.forEach(bm -> userCache.put(bm.getUser().getId(), bm.getUser()));
        } else {
            userRepository.findAllById(targetAssigneeIds).forEach(u -> userCache.put(u.getId(), u));
        }

        List<ScheduleBlock> blocks = scheduleBlockRepository
                .findByBoardIdAndScheduledDateAndAssigneeIdInOrderByStartTimeAsc(boardId, date, targetAssigneeIds);

        Map<String, List<ScheduleBlock>> blocksByAssignee = blocks.stream()
                .collect(Collectors.groupingBy(b -> b.getAssignee().getId()));

        List<ScheduleResponse.ColumnInfo> columns = new ArrayList<>();
        for (String assigneeId : targetAssigneeIds) {
            User user = userCache.get(assigneeId);
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

        // 크로스보드 조직 스케줄 조회
        if (includeOrgSchedules && board.getOrganization() != null) {
            String orgId = board.getOrganization().getId();
            List<String> orgBoardIds = boardRepository.findBoardIdsByOrgId(orgId);

            Set<String> userBoardIds = boardMemberRepository.findByUserIdWithActiveBoards(userId)
                    .stream().map(bm -> bm.getBoard().getId()).collect(Collectors.toSet());

            List<String> crossBoardIds = orgBoardIds.stream()
                    .filter(id -> !id.equals(boardId))
                    .filter(userBoardIds::contains)
                    .collect(Collectors.toList());

            if (!crossBoardIds.isEmpty()) {
                List<ScheduleBlock> crossBlocks = scheduleBlockRepository
                        .findByBoardIdInAndScheduledDateAndAssigneeIdIn(
                                crossBoardIds, date, targetAssigneeIds);

                Map<String, List<ScheduleBlock>> crossByAssignee = crossBlocks.stream()
                        .collect(Collectors.groupingBy(b -> b.getAssignee().getId()));

                List<ScheduleResponse.ColumnInfo> updatedColumns = new ArrayList<>();
                for (ScheduleResponse.ColumnInfo col : columns) {
                    List<ScheduleBlock> userCrossBlocks =
                            crossByAssignee.getOrDefault(col.getUser().getId(), List.of());
                    List<ScheduleResponse.BlockInfo> orgBlockInfos = userCrossBlocks.stream()
                            .map(ScheduleResponse.BlockInfo::of)
                            .collect(Collectors.toList());

                    updatedColumns.add(ScheduleResponse.ColumnInfo.builder()
                            .user(col.getUser())
                            .blocks(col.getBlocks())
                            .orgBlocks(orgBlockInfos.isEmpty() ? null : orgBlockInfos)
                            .build());
                }
                columns = updatedColumns;
            }
        }

        return ScheduleResponse.DailySchedule.builder()
                .date(date)
                .settings(ScheduleResponse.SettingsInfo.of(board))
                .columns(columns)
                .build();
    }

    /**
     * 주간 스케줄 조회 (7일치 데이터 한 번에)
     * 기존 7개 API 호출 → 1개로 통합하여 86% 감소
     */
    public ScheduleResponse.WeeklySchedule getWeeklySchedule(String boardId, LocalDate startDate, LocalDate endDate, List<String> assigneeIds, String userId, boolean includeOrgSchedules) {
        boardService.checkViewerOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        validateScheduleAccess(board);

        // 대상 담당자 목록
        Map<String, User> userCache = new java.util.HashMap<>();
        List<String> targetAssigneeIds = assigneeIds;
        if (targetAssigneeIds == null || targetAssigneeIds.isEmpty()) {
            var members = boardMemberRepository.findByBoardId(boardId);
            targetAssigneeIds = members.stream().map(bm -> bm.getUser().getId()).collect(Collectors.toList());
            members.forEach(bm -> userCache.put(bm.getUser().getId(), bm.getUser()));
        } else {
            userRepository.findAllById(targetAssigneeIds).forEach(u -> userCache.put(u.getId(), u));
        }

        // 기간 내 모든 블록 조회 (1회 쿼리)
        List<ScheduleBlock> allBlocks = scheduleBlockRepository
                .findByBoardIdAndScheduledDateBetween(boardId, startDate, endDate);

        // 날짜별 + 담당자별로 그룹핑
        Map<LocalDate, Map<String, List<ScheduleBlock>>> blocksByDateAndAssignee = allBlocks.stream()
                .collect(Collectors.groupingBy(
                        ScheduleBlock::getScheduledDate,
                        Collectors.groupingBy(b -> b.getAssignee().getId())
                ));

        // 크로스보드 조직 스케줄 조회
        Map<LocalDate, Map<String, List<ScheduleBlock>>> crossBlocksByDateAndAssignee = Map.of();
        if (includeOrgSchedules && board.getOrganization() != null) {
            String orgId = board.getOrganization().getId();
            List<String> orgBoardIds = boardRepository.findBoardIdsByOrgId(orgId);

            Set<String> userBoardIds = boardMemberRepository.findByUserIdWithActiveBoards(userId)
                    .stream().map(bm -> bm.getBoard().getId()).collect(Collectors.toSet());

            List<String> crossBoardIds = orgBoardIds.stream()
                    .filter(id -> !id.equals(boardId))
                    .filter(userBoardIds::contains)
                    .collect(Collectors.toList());

            if (!crossBoardIds.isEmpty()) {
                List<ScheduleBlock> crossBlocks = scheduleBlockRepository
                        .findByBoardIdInAndScheduledDateBetweenAndAssigneeIdIn(
                                crossBoardIds, startDate, endDate, targetAssigneeIds);

                crossBlocksByDateAndAssignee = crossBlocks.stream()
                        .collect(Collectors.groupingBy(
                                ScheduleBlock::getScheduledDate,
                                Collectors.groupingBy(b -> b.getAssignee().getId())
                        ));
            }
        }

        // 날짜별 DayData 생성
        List<ScheduleResponse.DayData> days = new ArrayList<>();
        LocalDate current = startDate;
        while (!current.isAfter(endDate)) {
            final LocalDate date = current;
            Map<String, List<ScheduleBlock>> blocksByAssignee = blocksByDateAndAssignee.getOrDefault(date, Map.of());
            Map<String, List<ScheduleBlock>> crossByAssignee = crossBlocksByDateAndAssignee.getOrDefault(date, Map.of());

            List<ScheduleResponse.ColumnInfo> columns = new ArrayList<>();
            for (String assigneeId : targetAssigneeIds) {
                User user = userCache.get(assigneeId);
                if (user == null) continue;

                List<ScheduleBlock> userBlocks = blocksByAssignee.getOrDefault(assigneeId, new ArrayList<>());
                List<ScheduleResponse.BlockInfo> blockInfos = userBlocks.stream()
                        .map(ScheduleResponse.BlockInfo::of)
                        .collect(Collectors.toList());

                // 크로스보드 orgBlocks
                List<ScheduleBlock> userCrossBlocks = crossByAssignee.getOrDefault(assigneeId, List.of());
                List<ScheduleResponse.BlockInfo> orgBlockInfos = userCrossBlocks.stream()
                        .map(ScheduleResponse.BlockInfo::of)
                        .collect(Collectors.toList());

                columns.add(ScheduleResponse.ColumnInfo.builder()
                        .user(ScheduleResponse.UserInfo.of(user))
                        .blocks(blockInfos)
                        .orgBlocks(orgBlockInfos.isEmpty() ? null : orgBlockInfos)
                        .build());
            }

            days.add(ScheduleResponse.DayData.builder()
                    .date(date)
                    .columns(columns)
                    .build());

            current = current.plusDays(1);
        }

        log.info("Weekly schedule loaded: {} ({} to {}) by user: {}", boardId, startDate, endDate, userId);

        return ScheduleResponse.WeeklySchedule.builder()
                .startDate(startDate)
                .endDate(endDate)
                .settings(ScheduleResponse.SettingsInfo.of(board))
                .days(days)
                .build();
    }

    @Transactional
    public ScheduleResponse.BlockDetail createScheduleBlock(String boardId, String userId, ScheduleRequest.Create request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        validateScheduleAccess(board);

        User assignee = userRepository.findById(request.getAssigneeId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        ChecklistItem checklistItem = null;
        if (request.getChecklistItemId() != null) {
            checklistItem = checklistItemRepository.findById(request.getChecklistItemId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));
        }

        Meeting meeting = null;
        if (request.getMeetingId() != null) {
            meeting = meetingRepository.findById(request.getMeetingId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.MEETING_NOT_FOUND));
        }

        ScheduleBlock block = ScheduleBlock.builder()
                .board(board)
                .checklistItem(checklistItem)
                .meeting(meeting)
                .blockType(determineBlockType(request))
                .title(request.getTitle())
                .color(request.getColor())
                .assignee(assignee)
                .scheduledDate(request.getScheduledDate())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .build();

        scheduleBlockRepository.save(block);

        log.info("Schedule block created: {} by user: {}", block.getId(), userId);

        User user = userRepository.findById(userId).orElse(null);
        ScheduleResponse.BlockDetail response = ScheduleResponse.BlockDetail.of(block);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.SCHEDULE_CREATED,
                userId, user != null ? user.getName() : null, response);

        return response;
    }

    @Transactional
    public ScheduleResponse.BlockDetail createWithChecklistItem(String boardId, String userId, ScheduleRequest.CreateWithChecklistItem request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        validateScheduleAccess(board);

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
                .blockType("CHECKLIST")
                .assignee(assignee)
                .scheduledDate(request.getScheduledDate())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .build();

        scheduleBlockRepository.save(block);

        log.info("Schedule block created with new checklist item: {} by user: {}", block.getId(), userId);

        User creator = userRepository.findById(userId).orElse(null);
        ScheduleResponse.BlockDetail response = ScheduleResponse.BlockDetail.of(block);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.SCHEDULE_CREATED,
                userId, creator != null ? creator.getName() : null, response);

        return response;
    }

    @Transactional
    public ScheduleResponse.BlockDetail updateScheduleBlock(String boardId, String blockId, String userId, ScheduleRequest.Update request) {
        boardService.checkMemberOrAbove(boardId, userId);

        ScheduleBlock block = scheduleBlockRepository.findById(blockId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULE_BLOCK_NOT_FOUND));

        if (!block.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.SCHEDULE_BLOCK_NOT_FOUND);
        }

        log.info("Schedule block update request: blockId={}, startTime={}, endTime={}", blockId, request.getStartTime(), request.getEndTime());

        block.updateTimes(request.getStartTime(), request.getEndTime());
        if ("CUSTOM".equals(block.getBlockType()) && (request.getTitle() != null || request.getColor() != null)) {
            block.updateCustomInfo(request.getTitle(), request.getColor());
        }
        scheduleBlockRepository.save(block);

        log.info("Schedule block updated: {} by user: {}", blockId, userId);

        User user = userRepository.findById(userId).orElse(null);
        ScheduleResponse.BlockDetail response = ScheduleResponse.BlockDetail.of(block);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.SCHEDULE_UPDATED,
                userId, user != null ? user.getName() : null, response);

        return response;
    }

    @Transactional
    public void deleteScheduleBlock(String boardId, String blockId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        ScheduleBlock block = scheduleBlockRepository.findById(blockId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULE_BLOCK_NOT_FOUND));

        if (!block.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.SCHEDULE_BLOCK_NOT_FOUND);
        }

        String deletedBlockId = block.getId();
        scheduleBlockRepository.delete(block);

        log.info("Schedule block deleted: {} by user: {}", blockId, userId);

        User user = userRepository.findById(userId).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.SCHEDULE_DELETED,
                userId, user != null ? user.getName() : null, Map.of("id", deletedBlockId));
    }

    @Transactional
    public ScheduleResponse.SettingsInfo updateScheduleSettings(String boardId, String userId, ScheduleRequest.UpdateSettings request) {
        boardService.checkAdminOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        board.updateScheduleSettings(request.getWorkHoursPerDay(), request.getWorkStartTime(),
                request.getScheduleDisplayMode(), request.getBreakStartTime(), request.getBreakEndTime());

        log.info("Schedule settings updated for board: {} by user: {}", boardId, userId);

        return ScheduleResponse.SettingsInfo.of(board);
    }

    public ScheduleResponse.SettingsInfo getScheduleSettings(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        return ScheduleResponse.SettingsInfo.of(board);
    }

    /**
     * 스케줄 블록이 있는 Task ID 목록 조회
     */
    public List<String> getScheduledTaskIds(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        return scheduleBlockRepository.findScheduledTaskIdsByBoardId(boardId);
    }

    /**
     * 체크리스트 아이템에 연결된 스케줄 블록 조회
     */
    public List<ScheduleResponse.BlockDetail> getSchedulesByChecklistItem(String boardId, String checklistItemId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        ChecklistItem checklistItem = checklistItemRepository.findById(checklistItemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        // 보드 소속 검증
        if (!checklistItem.getTask().getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }

        List<ScheduleBlock> blocks = scheduleBlockRepository.findByChecklistItemId(checklistItemId);

        return blocks.stream()
                .map(ScheduleResponse.BlockDetail::of)
                .collect(Collectors.toList());
    }

    /**
     * 여러 체크리스트 아이템에 연결된 스케줄 블록 벌크 조회
     */
    public Map<String, List<ScheduleResponse.BlockDetail>> getSchedulesByChecklistItems(String boardId, List<String> checklistItemIds, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        if (checklistItemIds == null || checklistItemIds.isEmpty()) {
            return Map.of();
        }

        List<ScheduleBlock> blocks = scheduleBlockRepository.findByChecklistItemIdIn(checklistItemIds);

        return blocks.stream()
                .collect(Collectors.groupingBy(
                        block -> block.getChecklistItem().getId(),
                        Collectors.mapping(ScheduleResponse.BlockDetail::of, Collectors.toList())
                ));
    }

    private void validateScheduleAccess(Board board) {
        if (!board.canAccessSchedule()) {
            throw new BusinessException(ErrorCode.PREMIUM_FEATURE_REQUIRED);
        }
    }

    private String determineBlockType(ScheduleRequest.Create request) {
        if (request.getBlockType() != null) {
            return request.getBlockType();
        }
        if (request.getMeetingId() != null) {
            return "MEETING";
        }
        if (request.getChecklistItemId() != null) {
            return "CHECKLIST";
        }
        return null;
    }
}
