package com.kanban.domain.dailychecklist.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.dailychecklist.DailyChecklist;
import com.kanban.domain.dailychecklist.DailyChecklistRepository;
import com.kanban.domain.dailychecklist.dto.DailyChecklistRequest;
import com.kanban.domain.dailychecklist.dto.DailyChecklistResponse;
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
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DailyChecklistService {

    private final DailyChecklistRepository dailyChecklistRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final WebSocketEventService webSocketEventService;

    /**
     * 데일리 체크리스트 조회 (멤버별 컬럼 구조로 반환)
     */
    public DailyChecklistResponse.ListResponse getDailyChecklist(String boardId, LocalDate date, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        // 해당 날짜의 모든 데일리 체크리스트 조회
        List<DailyChecklist> dailyChecklists = dailyChecklistRepository
                .findByBoardIdAndAssignedDateOrderByPositionAsc(boardId, date);

        // 보드의 모든 멤버 조회 (JOIN FETCH user)
        var boardMembers = boardMemberRepository.findByBoardId(boardId);
        List<String> memberIds = boardMembers.stream()
                .map(bm -> bm.getUser().getId())
                .collect(Collectors.toList());
        Map<String, User> userCache = new java.util.HashMap<>();
        boardMembers.forEach(bm -> userCache.put(bm.getUser().getId(), bm.getUser()));

        // 담당자별로 그룹핑
        Map<String, List<DailyChecklist>> byAssignee = dailyChecklists.stream()
                .collect(Collectors.groupingBy(dc -> dc.getAssignee().getId()));

        // 컬럼 구조로 변환
        List<DailyChecklistResponse.ColumnResponse> columns = new ArrayList<>();
        for (String memberId : memberIds) {
            User user = userCache.get(memberId);
            if (user == null) continue;

            List<DailyChecklist> userItems = byAssignee.getOrDefault(memberId, new ArrayList<>());
            List<DailyChecklistResponse.ItemResponse> itemResponses = userItems.stream()
                    .map(DailyChecklistResponse.ItemResponse::of)
                    .collect(Collectors.toList());

            columns.add(DailyChecklistResponse.ColumnResponse.builder()
                    .user(DailyChecklistResponse.UserInfo.of(user))
                    .items(itemResponses)
                    .build());
        }

        return DailyChecklistResponse.ListResponse.builder()
                .date(date)
                .columns(columns)
                .build();
    }

    /**
     * 기존 체크리스트 아이템을 데일리 체크리스트에 추가
     */
    @Transactional
    public DailyChecklistResponse.ItemResponse addItem(String boardId, DailyChecklistRequest.Create request, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        ChecklistItem checklistItem = checklistItemRepository.findById(request.getChecklistItemId())
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        // 체크리스트가 해당 보드에 속하는지 확인
        if (!checklistItem.getTask().getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }

        // 중복 체크
        if (dailyChecklistRepository.existsByBoardIdAndChecklistItemIdAndAssignedDate(
                boardId, request.getChecklistItemId(), request.getAssignedDate())) {
            throw new BusinessException(ErrorCode.DAILY_CHECKLIST_ALREADY_EXISTS);
        }

        User assignee = userRepository.findById(request.getAssigneeId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 다음 position 계산
        Integer maxPosition = dailyChecklistRepository.findMaxPositionByBoardIdAndAssignedDateAndAssigneeId(
                boardId, request.getAssignedDate(), request.getAssigneeId());
        int newPosition = (maxPosition != null) ? maxPosition + 1 : 0;

        DailyChecklist dailyChecklist = DailyChecklist.builder()
                .board(board)
                .checklistItem(checklistItem)
                .assignee(assignee)
                .assignedDate(request.getAssignedDate())
                .position(newPosition)
                .title(checklistItem.getTitle()) // 제목 백업
                .build();

        dailyChecklistRepository.save(dailyChecklist);

        log.info("Daily checklist item added: {} by user: {}", dailyChecklist.getId(), userId);

        User user = userRepository.findById(userId).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.SCHEDULE_CREATED,
                userId, user != null ? user.getName() : null, Map.of("id", dailyChecklist.getId()));

        return DailyChecklistResponse.ItemResponse.of(dailyChecklist);
    }

    /**
     * 새 체크리스트 아이템을 생성하면서 데일리 체크리스트에 추가
     */
    @Transactional
    public DailyChecklistResponse.ItemResponse addWithNewItem(String boardId, DailyChecklistRequest.CreateWithItem request, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        Task task = taskRepository.findById(request.getTaskId())
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        // Task가 해당 보드에 속하는지 확인
        if (!task.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
        }

        User assignee = userRepository.findById(request.getAssigneeId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 새 체크리스트 아이템 생성
        Integer maxChecklistPosition = checklistItemRepository.findMaxPositionByTaskId(task.getId());
        int newChecklistPosition = (maxChecklistPosition != null) ? maxChecklistPosition + 1 : 0;

        ChecklistItem checklistItem = ChecklistItem.builder()
                .task(task)
                .title(request.getTitle())
                .assignee(assignee)
                .position(newChecklistPosition)
                .build();

        checklistItemRepository.save(checklistItem);

        // 데일리 체크리스트에 추가
        Integer maxDailyPosition = dailyChecklistRepository.findMaxPositionByBoardIdAndAssignedDateAndAssigneeId(
                boardId, request.getAssignedDate(), request.getAssigneeId());
        int newDailyPosition = (maxDailyPosition != null) ? maxDailyPosition + 1 : 0;

        DailyChecklist dailyChecklist = DailyChecklist.builder()
                .board(board)
                .checklistItem(checklistItem)
                .assignee(assignee)
                .assignedDate(request.getAssignedDate())
                .position(newDailyPosition)
                .title(request.getTitle()) // 제목 백업
                .build();

        dailyChecklistRepository.save(dailyChecklist);

        log.info("Daily checklist item added with new checklist: {} by user: {}", dailyChecklist.getId(), userId);

        User user = userRepository.findById(userId).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.SCHEDULE_CREATED,
                userId, user != null ? user.getName() : null, Map.of("id", dailyChecklist.getId()));

        return DailyChecklistResponse.ItemResponse.of(dailyChecklist);
    }

    /**
     * 데일리 체크리스트 아이템 순서 변경
     */
    @Transactional
    public DailyChecklistResponse.ItemResponse updatePosition(String boardId, String itemId, DailyChecklistRequest.UpdatePosition request, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        DailyChecklist dailyChecklist = dailyChecklistRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.DAILY_CHECKLIST_NOT_FOUND));

        // 보드 소속 확인
        if (!dailyChecklist.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.DAILY_CHECKLIST_NOT_FOUND);
        }

        int oldPosition = dailyChecklist.getPosition();
        int newPosition = request.getPosition();

        // 위치가 같으면 변경 불필요
        if (oldPosition == newPosition) {
            return DailyChecklistResponse.ItemResponse.of(dailyChecklist);
        }

        // 같은 담당자, 같은 날짜의 모든 항목 조회 (position 순)
        List<DailyChecklist> items = dailyChecklistRepository
                .findByBoardIdAndAssignedDateAndAssigneeIdOrderByPositionAsc(
                        boardId, dailyChecklist.getAssignedDate(), dailyChecklist.getAssignee().getId());

        // newPosition이 범위를 벗어나면 조정
        if (newPosition < 0) {
            newPosition = 0;
        }
        if (newPosition >= items.size()) {
            newPosition = items.size() - 1;
        }

        // 다른 항목들의 position 재정렬
        if (oldPosition < newPosition) {
            // 아래로 이동: oldPosition+1 ~ newPosition의 항목들을 한 칸씩 위로
            for (DailyChecklist item : items) {
                int pos = item.getPosition();
                if (pos > oldPosition && pos <= newPosition) {
                    item.updatePosition(pos - 1);
                }
            }
        } else {
            // 위로 이동: newPosition ~ oldPosition-1의 항목들을 한 칸씩 아래로
            for (DailyChecklist item : items) {
                int pos = item.getPosition();
                if (pos >= newPosition && pos < oldPosition) {
                    item.updatePosition(pos + 1);
                }
            }
        }

        // 이동 대상 항목의 position 업데이트
        dailyChecklist.updatePosition(newPosition);

        log.info("Daily checklist item position updated: {} from {} to {} by user: {}", itemId, oldPosition, newPosition, userId);

        return DailyChecklistResponse.ItemResponse.of(dailyChecklist);
    }

    /**
     * 데일리 체크리스트 아이템 삭제
     */
    @Transactional
    public void removeItem(String boardId, String itemId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        DailyChecklist dailyChecklist = dailyChecklistRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.DAILY_CHECKLIST_NOT_FOUND));

        // 보드 소속 확인
        if (!dailyChecklist.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.DAILY_CHECKLIST_NOT_FOUND);
        }

        String deletedId = dailyChecklist.getId();
        dailyChecklistRepository.delete(dailyChecklist);

        log.info("Daily checklist item removed: {} by user: {}", itemId, userId);

        User user = userRepository.findById(userId).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.SCHEDULE_DELETED,
                userId, user != null ? user.getName() : null, Map.of("id", deletedId));
    }
}
