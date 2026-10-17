package com.kanban.domain.dailychecklist.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.checklist.dto.ChecklistResponse;
import com.kanban.domain.checklist.service.ChecklistService;
import com.kanban.domain.dailychecklist.DailyChecklist;
import com.kanban.domain.dailychecklist.DailyChecklistKind;
import com.kanban.domain.dailychecklist.DailyChecklistRepository;
import com.kanban.domain.dailychecklist.dto.DailyChecklistRequest;
import com.kanban.domain.dailychecklist.dto.DailyChecklistResponse;
import com.kanban.domain.meeting.dto.MeetingResponse;
import com.kanban.domain.meeting.service.MeetingService;
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
    private final ChecklistService checklistService;
    private final MeetingService meetingService;
    private final WebSocketEventService webSocketEventService;
    private final DailyChecklistResolver dailyChecklistResolver;

    /**
     * 타임블록 모달용 통합 데이터 조회
     * (오늘의 체크리스트 + 보드 체크리스트 + 회의 목록)
     */
    public DailyChecklistResponse.TimeblockDataResponse getTimeblockData(
            String boardId, LocalDate date, String assigneeId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateDailyChecklistAccess(boardId);

        // 1. 해당 날짜/담당자의 오늘의 체크리스트 (파생 + 핀 - 제외, 미완료만)
        //    데일리 뷰와 동일한 리졸버를 쓴다 — 두 화면이 다른 목록을 보던 문제의 원인이었다.
        List<DailyChecklistResponse.ItemResponse> dailyItems =
                dailyChecklistResolver.resolveForAssignee(boardId, date, assigneeId).stream()
                        .filter(resolved -> !resolved.completed())
                        .map(DailyChecklistResponse.ItemResponse::of)
                        .collect(Collectors.toList());

        // 2. 보드 체크리스트 항목
        ChecklistResponse.BoardListResponse boardChecklist =
                checklistService.getBoardChecklistItems(boardId, userId, assigneeId, null, null);

        // 3. 회의 목록
        List<MeetingResponse.Summary> meetings = meetingService.getMeetingsByDate(boardId, date, userId);

        return DailyChecklistResponse.TimeblockDataResponse.builder()
                .dailyChecklistItems(dailyItems)
                .boardChecklistItems(boardChecklist.getItems())
                .meetings(meetings)
                .build();
    }

    /**
     * 날짜 범위 내 데일리 체크리스트 조회 (캘린더용)
     */
    public List<DailyChecklistResponse.ItemResponse> getChecklistItemsInRange(
            String boardId, LocalDate startDate, LocalDate endDate, String assigneeId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateDailyChecklistAccess(boardId);

        List<DailyChecklist> items = dailyChecklistRepository
                .findByBoardIdAndAssignedDateBetweenAndAssigneeId(boardId, startDate, endDate, assigneeId);

        return items.stream()
                .map(DailyChecklistResponse.ItemResponse::of)
                .collect(Collectors.toList());
    }

    /**
     * 오늘의 체크리스트 조회 (멤버별 컬럼 구조로 반환)
     */
    public DailyChecklistResponse.ListResponse getDailyChecklist(String boardId, LocalDate date, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateDailyChecklistAccess(boardId);

        // 파생 + 핀 - 제외를 병합한 담당자별 목록
        Map<String, List<DailyChecklistResolver.ResolvedItem>> byAssignee =
                dailyChecklistResolver.resolveByAssignee(boardId, date);

        // 보드의 모든 멤버 조회 (JOIN FETCH user)
        var boardMembers = boardMemberRepository.findByBoardId(boardId);
        List<String> memberIds = boardMembers.stream()
                .map(bm -> bm.getUser().getId())
                .collect(Collectors.toList());
        Map<String, User> userCache = new java.util.HashMap<>();
        boardMembers.forEach(bm -> userCache.put(bm.getUser().getId(), bm.getUser()));

        // 컬럼 구조로 변환
        List<DailyChecklistResponse.ColumnResponse> columns = new ArrayList<>();
        for (String memberId : memberIds) {
            User user = userCache.get(memberId);
            if (user == null) continue;

            List<DailyChecklistResponse.ItemResponse> itemResponses =
                    byAssignee.getOrDefault(memberId, List.of()).stream()
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

        User assignee = userRepository.findById(request.getAssigneeId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 다음 position 계산
        Integer maxPosition = dailyChecklistRepository.findMaxPositionByBoardIdAndAssignedDateAndAssigneeId(
                boardId, request.getAssignedDate(), request.getAssigneeId());
        int newPosition = (maxPosition != null) ? maxPosition + 1 : 0;

        // 같은 날짜에 예외 행이 이미 있으면 재사용한다.
        // (board_id, checklist_item_id, assigned_date) 유니크 제약상 최대 1건.
        var existing = dailyChecklistRepository.findOverride(
                boardId, request.getChecklistItemId(), request.getAssignedDate());
        if (existing.isPresent()) {
            DailyChecklist override = existing.get();
            if (override.isPin()) {
                throw new BusinessException(ErrorCode.DAILY_CHECKLIST_ALREADY_EXISTS);
            }
            // "오늘에서 뺐던" 항목을 다시 가져오는 경우 — 제외를 풀고 핀으로 되돌린다
            override.changeKind(DailyChecklistKind.PIN);
            override.updatePosition(newPosition);

            log.info("Daily checklist exclude reverted to pin: {} by user: {}", override.getId(), userId);

            User actor = userRepository.findById(userId).orElse(null);
            webSocketEventService.sendBoardEvent(boardId, BoardEventType.SCHEDULE_CREATED,
                    userId, actor != null ? actor.getName() : null, Map.of("id", override.getId()));

            return DailyChecklistResponse.ItemResponse.of(override);
        }

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
        // 스프린트 편입은 부모 태스크가 들고 있어 별도 처리가 필요 없다.

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
     * 오늘의 체크리스트에서 항목 빼기 (원본 체크리스트는 그대로 둔다).
     *
     * <p>항목이 기간 때문에 자동으로 들어온 것이라면 행을 지워도 다음 조회에서 다시 나타나므로,
     * "그 날은 안 한다"는 뜻의 EXCLUDE 행을 남긴다. 기간과 무관한 항목에 EXCLUDE가 남아도
     * 어차피 파생되지 않으므로 무해하고, 다시 가져오면 {@link #addItem}이 PIN으로 되돌린다.</p>
     */
    @Transactional
    public void excludeItem(String boardId, DailyChecklistRequest.Exclude request, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        ChecklistItem checklistItem = checklistItemRepository.findById(request.getChecklistItemId())
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        if (!checklistItem.getTask().getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }

        String excludedId;
        var existing = dailyChecklistRepository.findOverride(
                boardId, request.getChecklistItemId(), request.getAssignedDate());

        if (existing.isPresent()) {
            DailyChecklist override = existing.get();
            override.changeKind(DailyChecklistKind.EXCLUDE);
            excludedId = override.getId();
        } else {
            String assigneeId = request.getAssigneeId() != null
                    ? request.getAssigneeId()
                    : (checklistItem.getAssignee() != null ? checklistItem.getAssignee().getId() : null);
            if (assigneeId == null) {
                throw new BusinessException(ErrorCode.USER_NOT_FOUND);
            }
            User assignee = userRepository.findById(assigneeId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

            DailyChecklist override = DailyChecklist.builder()
                    .board(board)
                    .checklistItem(checklistItem)
                    .assignee(assignee)
                    .assignedDate(request.getAssignedDate())
                    .kind(DailyChecklistKind.EXCLUDE)
                    .position(0)
                    .title(checklistItem.getTitle())
                    .build();
            dailyChecklistRepository.save(override);
            excludedId = override.getId();
        }

        log.info("Daily checklist item excluded: {} ({}) by user: {}",
                request.getChecklistItemId(), request.getAssignedDate(), userId);

        User user = userRepository.findById(userId).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.SCHEDULE_DELETED,
                userId, user != null ? user.getName() : null, Map.of("id", excludedId));
    }

    /**
     * 데일리 체크리스트 행 삭제.
     *
     * <p>원본 체크리스트가 연결된 행이면 삭제 대신 EXCLUDE로 전환한다 —
     * 그냥 지우면 기간 때문에 다음 조회에서 그대로 되살아나기 때문이다.
     * 원본이 없는 임시(ad-hoc) 항목만 실제로 삭제된다.</p>
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

        String removedId = dailyChecklist.getId();
        if (dailyChecklist.getChecklistItem() != null) {
            dailyChecklist.changeKind(DailyChecklistKind.EXCLUDE);
            log.info("Daily checklist item excluded (via delete): {} by user: {}", itemId, userId);
        } else {
            dailyChecklistRepository.delete(dailyChecklist);
            log.info("Daily checklist ad-hoc item removed: {} by user: {}", itemId, userId);
        }

        User user = userRepository.findById(userId).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.SCHEDULE_DELETED,
                userId, user != null ? user.getName() : null, Map.of("id", removedId));
    }

    private void validateDailyChecklistAccess(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        if (!board.canAccessDailyChecklist()) {
            throw new BusinessException(ErrorCode.PREMIUM_FEATURE_REQUIRED);
        }
    }
}
