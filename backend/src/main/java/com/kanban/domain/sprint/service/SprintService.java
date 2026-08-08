package com.kanban.domain.sprint.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.integration.jira.JiraIntegrationConfigRepository;
import com.kanban.domain.integration.jira.JiraIssueLink;
import com.kanban.domain.integration.jira.JiraIssueLinkRepository;
import com.kanban.domain.integration.jira.JiraLinkTargetType;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.sprint.Sprint;
import com.kanban.domain.sprint.SprintColumn;
import com.kanban.domain.sprint.SprintColumnKind;
import com.kanban.domain.sprint.SprintColumnRepository;
import com.kanban.domain.sprint.SprintRepository;
import com.kanban.domain.sprint.SprintStatus;
import com.kanban.domain.sprint.dto.SprintResponse;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 스프린트 보드 서비스.
 *
 * <p>담기 단위는 <b>태스크</b>다. 체크리스트는 태스크에 딸린 내용물이라 따로 담지 않으며,
 * 태스크가 스프린트에 들어가 있으면 그 뒤에 추가된 체크리스트도 자동으로 같은 스프린트 안에 있게 된다.
 *
 * <p>완료 판정은 <b>END(Done) 컬럼 도달</b>이다. 체크리스트 진척은 카드에 표시되는 참고 값일 뿐
 * 완료를 좌우하지 않으며, 칸반 블록 기준 완료(task.isCompleted)와도 별개로 움직인다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SprintService {

    private final SprintRepository sprintRepository;
    private final SprintColumnRepository sprintColumnRepository;
    private final TaskRepository taskRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final MilestoneRepository milestoneRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final WebSocketEventService webSocketEventService;
    private final JiraIssueLinkRepository jiraIssueLinkRepository;
    private final JiraIntegrationConfigRepository jiraIntegrationConfigRepository;

    // 기본 컬럼 시드 (앞뒤 고정 + 기본 중간 1개)
    private static final String COL_SPRINT = "Sprint";
    private static final String COL_REVIEW = "In Review";
    private static final String COL_DONE = "Done";

    // ==================== Read ====================

    @Transactional
    public SprintResponse.Board getSprintBoard(String boardId, String milestoneId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        Milestone milestone = loadMilestone(boardId, milestoneId);

        // 레벨 1(시간 묶음 없음)에도 흐름 컬럼(In Review·Done)은 있어야 한다 —
        // 일은 마감이 없어도 흐른다. 흐름 컬럼이 SprintColumn이므로 레벨과 무관하게 프로비저닝한다.
        // sprintEnabled는 이제 사용자 개념이 아니라 내부 값이고, 사용자에게 보이는 건 boards.ui_level뿐이다.
        int uiLevel = resolveUiLevel(milestone);
        if (uiLevel <= 1 || Boolean.TRUE.equals(milestone.getSprintEnabled())) {
            ensureColumns(milestone);
            ensureActiveSprint(milestone);
        }
        if (uiLevel <= 1) {
            adoptBacklogForLevelOne(milestone);
        }
        return buildBoard(milestone, userId);
    }

    private int resolveUiLevel(Milestone milestone) {
        Integer level = milestone.getBoard().getUiLevel();
        return level == null ? Board.MAX_UI_LEVEL : level;
    }

    /**
     * 레벨 1 자동 담기 — 백로그에 남은 태스크를 활성 스프린트의 START 컬럼으로 끌어올린다.
     *
     * <p>레벨 1에는 "담기"가 없어 백로그 레일이 화면에 없다. 그대로 두면 사용자가 만든 태스크가
     * 어디에도 안 보이므로, 보드를 열 때마다 멱등하게 흡수한다.
     * 레벨 2로 올라가면 승급 마법사가 "이번 주기에 할 것"만 남기고 나머지를 백로그로 되돌린다.
     */
    private void adoptBacklogForLevelOne(Milestone milestone) {
        List<Task> backlog = taskRepository.findBacklogByMilestoneId(milestone.getId());
        if (backlog.isEmpty()) {
            return;
        }
        Sprint active = sprintRepository.findByMilestoneIdOrderBySequenceNoAsc(milestone.getId()).stream()
                .filter(Sprint::isActive)
                .reduce((first, second) -> second)
                .orElse(null);
        if (active == null) {
            return;
        }
        SprintColumn start = requireColumn(milestone, SprintColumnKind.START);
        backlog.forEach(task -> task.assignToSprint(active, start));
        log.info("Level-1 backlog adopted: milestone={} count={}", milestone.getId(), backlog.size());
    }

    // ==================== Toggle (관리자) ====================

    @Transactional
    public SprintResponse.Board toggleSprintMode(String boardId, String milestoneId, boolean enabled, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Milestone milestone = loadMilestone(boardId, milestoneId);
        milestone.updateSprintEnabled(enabled);

        if (enabled) {
            ensureColumns(milestone);
            ensureActiveSprint(milestone);
        } else {
            // 병합: 담긴 태스크를 모두 백로그로 되돌리고 스프린트 삭제 (컬럼 구성은 보존)
            taskRepository.findInSprintByMilestoneId(milestoneId).forEach(Task::removeFromSprint);
            sprintRepository.deleteByMilestoneId(milestoneId);
        }
        broadcastSprintChanged(boardId, userId);
        return buildBoard(milestone, userId);
    }

    // ==================== 담기 / 빼기 / 이동 (멤버+) ====================

    /** 태스크 담기. 담는 순간 그 태스크의 체크리스트 전체가 함께 스프린트 스코프에 들어온다. */
    @Transactional
    public SprintResponse.Board addTask(String boardId, String sprintId, String taskId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        Sprint sprint = loadSprint(boardId, sprintId);
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));

        // 태스크가 스프린트와 같은 마일스톤에 속하는지 검증
        Milestone taskMilestone = task.getMilestone();
        if (taskMilestone == null || !taskMilestone.getId().equals(sprint.getMilestone().getId())) {
            throw new BusinessException(ErrorCode.SPRINT_TASK_NOT_IN_MILESTONE);
        }
        Milestone milestone = sprint.getMilestone();
        ensureColumns(milestone);
        task.assignToSprint(sprint, requireColumn(milestone, SprintColumnKind.START));
        broadcastSprintChanged(boardId, userId);
        return buildBoard(milestone, userId);
    }

    /**
     * 주기 이름·기간 변경. 담긴 태스크의 날짜는 아직 주기를 따라가지 않는다 —
     * 그 종속은 PR4(태스크 날짜 파생 전환)에서 붙인다.
     */
    @Transactional
    public SprintResponse.Board updateSprint(String boardId, String sprintId, String name,
                                             java.time.LocalDate startDate, java.time.LocalDate endDate,
                                             String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        Sprint sprint = loadSprint(boardId, sprintId);
        if (name != null) {
            sprint.rename(name);
        }
        if (startDate != null || endDate != null) {
            sprint.updatePeriod(startDate, endDate);
        }
        broadcastSprintChanged(boardId, userId);
        return buildBoard(sprint.getMilestone(), userId);
    }

    /** 태스크 빼기 (백로그로 복귀). 체크리스트는 태스크를 따라 함께 빠진다. */
    @Transactional
    public SprintResponse.Board removeTask(String boardId, String sprintId, String taskId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        Sprint sprint = loadSprint(boardId, sprintId);
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));
        task.removeFromSprint();
        broadcastSprintChanged(boardId, userId);
        return buildBoard(sprint.getMilestone(), userId);
    }

    /** 카드 컬럼 이동 (드래그). END 컬럼 도달 = 스프린트 상의 완료. */
    @Transactional
    public SprintResponse.Board moveToColumn(String boardId, String taskId, String columnId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));
        Sprint sprint = task.getSprint();
        if (sprint == null) {
            throw new BusinessException(ErrorCode.SPRINT_TASK_NOT_IN_MILESTONE);
        }
        if (!sprint.getMilestone().getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.SPRINT_NOT_FOUND);
        }
        validateAccess(boardId);
        SprintColumn column = sprintColumnRepository.findById(columnId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SPRINT_COLUMN_NOT_FOUND));
        if (!column.getMilestone().getId().equals(sprint.getMilestone().getId())) {
            throw new BusinessException(ErrorCode.SPRINT_COLUMN_NOT_FOUND);
        }
        task.moveToSprintColumn(column);
        broadcastSprintChanged(boardId, userId);
        return buildBoard(sprint.getMilestone(), userId);
    }

    // ==================== 컬럼 CRUD (관리자) ====================

    /** 중간 컬럼 추가 (항상 END 앞에 삽입) */
    @Transactional
    public SprintResponse.Board createColumn(String boardId, String milestoneId, String name, String color, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Milestone milestone = loadMilestone(boardId, milestoneId);
        if (name == null || name.isBlank()) {
            throw new BusinessException(ErrorCode.SPRINT_COLUMN_NAME_REQUIRED);
        }
        ensureColumns(milestone);
        SprintColumn end = requireColumn(milestone, SprintColumnKind.END);
        int newPos = end.getPosition();
        end.updatePosition(newPos + 1);
        SprintColumn col = SprintColumn.builder()
                .milestone(milestone)
                .name(name.trim())
                .kind(SprintColumnKind.MIDDLE)
                .position(newPos)
                .color(color)
                .build();
        sprintColumnRepository.save(col);
        broadcastSprintChanged(boardId, userId);
        return buildBoard(milestone, userId);
    }

    /** 컬럼 이름/색 변경 (앵커는 불가) */
    @Transactional
    public SprintResponse.Board updateColumn(String boardId, String columnId, String name, String color, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        SprintColumn col = loadColumn(boardId, columnId);
        if (col.isAnchor()) {
            throw new BusinessException(ErrorCode.SPRINT_COLUMN_ANCHOR_IMMUTABLE);
        }
        if (name != null && !name.isBlank()) {
            col.rename(name);
        }
        if (color != null) {
            col.updateColor(color.isBlank() ? null : color);
        }
        broadcastSprintChanged(boardId, userId);
        return buildBoard(col.getMilestone(), userId);
    }

    /** 중간 컬럼 삭제 — 담긴 카드는 직전(앞) 컬럼으로 이동 (앵커는 불가) */
    @Transactional
    public SprintResponse.Board deleteColumn(String boardId, String columnId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        SprintColumn col = loadColumn(boardId, columnId);
        if (col.isAnchor()) {
            throw new BusinessException(ErrorCode.SPRINT_COLUMN_ANCHOR_IMMUTABLE);
        }
        Milestone milestone = col.getMilestone();
        List<SprintColumn> cols = sprintColumnRepository.findByMilestoneIdOrderByPositionAsc(milestone.getId());
        // 직전(앞) 컬럼 = position이 더 작은 것 중 가장 큰 것 (없으면 START, 최소한 첫 컬럼)
        SprintColumn prev = cols.stream()
                .filter(c -> c.getPosition() < col.getPosition())
                .reduce((a, b) -> a.getPosition() >= b.getPosition() ? a : b)
                .orElse(cols.isEmpty() ? null : cols.get(0));
        List<Task> tasks = taskRepository.findBySprintColumnId(columnId);
        if (prev != null) {
            tasks.forEach(t -> t.moveToSprintColumn(prev));
        } else {
            tasks.forEach(Task::removeFromSprint);
        }
        sprintColumnRepository.delete(col);
        broadcastSprintChanged(boardId, userId);
        return buildBoard(milestone, userId);
    }

    /** 중간 컬럼 순서 재정렬 (START=0 고정, 넘어온 순서대로 1..n, END는 맨 뒤) */
    @Transactional
    public SprintResponse.Board reorderColumns(String boardId, String milestoneId, List<String> columnIds, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Milestone milestone = loadMilestone(boardId, milestoneId);
        List<SprintColumn> cols = sprintColumnRepository.findByMilestoneIdOrderByPositionAsc(milestone.getId());
        Map<String, SprintColumn> byId = new LinkedHashMap<>();
        for (SprintColumn c : cols) {
            byId.put(c.getId(), c);
        }
        int pos = 1;
        for (String id : columnIds) {
            SprintColumn c = byId.get(id);
            if (c != null && c.isMiddle()) {
                c.updatePosition(pos++);
            }
        }
        // START/END 앵커 위치 고정
        requireColumn(milestone, SprintColumnKind.START).updatePosition(0);
        requireColumn(milestone, SprintColumnKind.END).updatePosition(pos);
        broadcastSprintChanged(boardId, userId);
        return buildBoard(milestone, userId);
    }

    // ==================== 라이프사이클: 종료 / 재활성화 (관리자) ====================

    /**
     * 스프린트 종료. 기간이 끝나면 닫을 수 있어야 하므로 "전부 Done" 게이트는 두지 않는다.
     * 종료 시점의 완료/전체 수를 동결하고, 아직 Done에 닿지 못한 태스크는 다음 스프린트로 이월한다.
     * 이월된 태스크는 carryOverCount가 1 올라가 몇 스프린트째 밀리는 중인지 드러난다.
     */
    @Transactional
    public SprintResponse.Board closeSprint(String boardId, String sprintId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Sprint sprint = loadSprint(boardId, sprintId);
        if (!sprint.isActive()) {
            throw new BusinessException(ErrorCode.SPRINT_NOT_ACTIVE);
        }

        Milestone milestone = sprint.getMilestone();
        String milestoneId = milestone.getId();
        ensureColumns(milestone);

        // 동결 수치는 이월 전에 센다 — 라이브 게이지와 같은 체크리스트 줄 기준이라
        // 종료 직전 화면의 %가 그대로 기록에 남는다.
        int[] units = sprintProgressUnits(sprintId);
        sprint.archive(units[0], units[1], LocalDateTime.now(ZoneOffset.UTC));

        // 다음 스프린트 확보 — 최신 스프린트를 닫았으면 새로 만들고, 재활성화 중이었으면 최신으로 복귀.
        Sprint latest = sprintRepository.findFirstByMilestoneIdOrderBySequenceNoDesc(milestoneId)
                .orElse(sprint);
        Sprint next;
        if (latest.getId().equals(sprint.getId())) {
            int nextSeq = sprintRepository.findMaxSequenceNo(milestoneId) + 1;
            next = createSprint(milestone, nextSeq);
        } else {
            latest.reactivate();
            next = latest;
        }

        // 미완료 태스크 이월 — Sprint(START) 컬럼부터 다시 시작한다.
        List<Task> carried = taskRepository.findNotDoneBySprintId(sprintId, SprintColumnKind.END);
        if (!carried.isEmpty()) {
            SprintColumn start = requireColumn(milestone, SprintColumnKind.START);
            carried.forEach(t -> t.carryOverTo(next, start));
            log.info("Sprint {} closed — {} tasks carried over to {}",
                    sprint.getName(), carried.size(), next.getName());
        }

        broadcastSprintChanged(boardId, userId);
        return buildBoard(milestone, userId);
    }

    @Transactional
    public SprintResponse.Board reactivateSprint(String boardId, String sprintId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Sprint target = loadSprint(boardId, sprintId);
        if (target.isActive()) {
            throw new BusinessException(ErrorCode.SPRINT_ALREADY_ACTIVE);
        }
        Milestone milestone = target.getMilestone();
        String milestoneId = milestone.getId();
        int maxSeq = sprintRepository.findMaxSequenceNo(milestoneId);

        Sprint active = sprintRepository
                .findFirstByMilestoneIdAndStatusOrderBySequenceNoDesc(milestoneId, SprintStatus.ACTIVE)
                .orElse(null);
        if (active != null) {
            if (active.getSequenceNo() != maxSeq) {
                throw new BusinessException(ErrorCode.SPRINT_REACTIVATION_BLOCKED);
            }
            int[] units = sprintProgressUnits(active.getId());
            active.archive(units[0], units[1], LocalDateTime.now(ZoneOffset.UTC));
        }

        target.reactivate();
        broadcastSprintChanged(boardId, userId);
        return buildBoard(milestone, userId);
    }

    @Transactional
    public SprintResponse.Board cancelReactivation(String boardId, String sprintId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Sprint reactivated = loadSprint(boardId, sprintId);
        if (!reactivated.isActive()) {
            throw new BusinessException(ErrorCode.SPRINT_NOT_ACTIVE);
        }
        Milestone milestone = reactivated.getMilestone();
        int maxSeq = sprintRepository.findMaxSequenceNo(milestone.getId());
        if (reactivated.getSequenceNo() == maxSeq) {
            throw new BusinessException(ErrorCode.SPRINT_NOT_IN_REACTIVATION);
        }
        reactivated.archive(reactivated.getCompletedCount(), reactivated.getTotalCount(),
                LocalDateTime.now(ZoneOffset.UTC));
        Sprint latest = sprintRepository.findFirstByMilestoneIdOrderBySequenceNoDesc(milestone.getId())
                .orElse(reactivated);
        latest.reactivate();
        broadcastSprintChanged(boardId, userId);
        return buildBoard(milestone, userId);
    }

    /** 태스크 재개 — 아카이브(또는 다른) 스프린트의 태스크를 현재 활성 스프린트로 다시 담는다 (Sprint 컬럼). */
    @Transactional
    public SprintResponse.Board resumeTask(String boardId, String taskId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        Task task = taskRepository.findById(taskId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TASK_NOT_FOUND));
        Sprint from = task.getSprint();
        if (from == null) {
            throw new BusinessException(ErrorCode.SPRINT_TASK_NOT_IN_MILESTONE);
        }
        if (!from.getMilestone().getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.SPRINT_NOT_FOUND);
        }
        validateAccess(boardId);
        Milestone milestone = from.getMilestone();
        Sprint active = sprintRepository
                .findFirstByMilestoneIdAndStatusOrderBySequenceNoDesc(milestone.getId(), SprintStatus.ACTIVE)
                .orElseThrow(() -> new BusinessException(ErrorCode.SPRINT_NOT_FOUND));
        ensureColumns(milestone);
        task.assignToSprint(active, requireColumn(milestone, SprintColumnKind.START));
        broadcastSprintChanged(boardId, userId);
        return buildBoard(milestone, userId);
    }

    /** 특정 스프린트에 담긴 태스크 카드 목록 (아카이브 열람 / 재개 UI용) */
    public List<SprintResponse.ItemCard> getSprintTasks(String boardId, String sprintId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        loadSprint(boardId, sprintId);
        Map<String, List<ChecklistItem>> byTask = groupByTask(checklistItemRepository.findByTaskSprintId(sprintId));
        return taskRepository.findBySprintId(sprintId).stream()
                .map(t -> SprintResponse.ItemCard.of(t, byTask.getOrDefault(t.getId(), List.of())))
                .toList();
    }

    /**
     * 마일스톤 관리 콘솔용 — 마일스톤에 속한 전체 태스크를 스프린트 담김 여부와 무관하게 반환한다.
     * FE에서 Feature ▸ Task 트리로 재구성해 피쳐 칩/태스크 칸반을 렌더한다.
     */
    public List<SprintResponse.ItemCard> getMilestoneConsole(String boardId, String milestoneId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        loadMilestone(boardId, milestoneId);
        Map<String, List<ChecklistItem>> byTask =
                groupByTask(checklistItemRepository.findByTaskMilestoneId(milestoneId));
        return taskRepository.findAllByMilestoneIdWithSprint(milestoneId).stream()
                .map(t -> SprintResponse.ItemCard.of(t, byTask.getOrDefault(t.getId(), List.of())))
                .toList();
    }

    // ==================== Helpers ====================

    /** 체크리스트를 부모 태스크 id로 묶는다 (카드 진척 집계용). */
    private Map<String, List<ChecklistItem>> groupByTask(List<ChecklistItem> items) {
        Map<String, List<ChecklistItem>> byTask = new HashMap<>();
        for (ChecklistItem c : items) {
            if (c.getTask() == null) {
                continue;
            }
            byTask.computeIfAbsent(c.getTask().getId(), k -> new ArrayList<>()).add(c);
        }
        return byTask;
    }

    /**
     * 스프린트 뮤테이션(담기/빼기/컬럼 이동·CRUD/스프린트 on-off/라이프사이클) 후,
     * 스프린트 보드를 보고 있는 다른 클라이언트가 재조회하도록 SPRINT_UPDATED를 브로드캐스트한다.
     * 페이로드가 필요 없는 "재조회 신호" — useSprintRealtime 훅이 받아 디바운스 재조회한다.
     */
    private void broadcastSprintChanged(String boardId, String userId) {
        String userName = userRepository.findById(userId).map(u -> u.getName()).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.SPRINT_UPDATED, userId, userName, Map.of());
    }

    /** 마일스톤에 컬럼이 없으면 기본 3컬럼(Sprint/In Review/Done) 시드 */
    private void ensureColumns(Milestone milestone) {
        if (sprintColumnRepository.countByMilestoneId(milestone.getId()) > 0) {
            return;
        }
        sprintColumnRepository.save(SprintColumn.builder()
                .milestone(milestone).name(COL_SPRINT).kind(SprintColumnKind.START).position(0).build());
        sprintColumnRepository.save(SprintColumn.builder()
                .milestone(milestone).name(COL_REVIEW).kind(SprintColumnKind.MIDDLE).position(1).build());
        sprintColumnRepository.save(SprintColumn.builder()
                .milestone(milestone).name(COL_DONE).kind(SprintColumnKind.END).position(2).build());
    }

    /** 스프린트가 하나도 없으면 Sprint 1 자동 생성 */
    private void ensureActiveSprint(Milestone milestone) {
        if (sprintRepository.findMaxSequenceNo(milestone.getId()) == 0) {
            createSprint(milestone, 1);
        }
    }

    private SprintColumn requireColumn(Milestone milestone, SprintColumnKind kind) {
        return sprintColumnRepository.findFirstByMilestoneIdAndKind(milestone.getId(), kind)
                .orElseThrow(() -> new BusinessException(ErrorCode.SPRINT_COLUMN_NOT_FOUND));
    }

    private Milestone loadMilestone(String boardId, String milestoneId) {
        Milestone milestone = milestoneRepository.findById(milestoneId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_NOT_FOUND));
        if (!milestone.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
        }
        validateAccess(boardId);
        return milestone;
    }

    private Sprint loadSprint(String boardId, String sprintId) {
        Sprint sprint = sprintRepository.findById(sprintId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SPRINT_NOT_FOUND));
        if (!sprint.getMilestone().getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.SPRINT_NOT_FOUND);
        }
        validateAccess(boardId);
        return sprint;
    }

    private SprintColumn loadColumn(String boardId, String columnId) {
        SprintColumn col = sprintColumnRepository.findById(columnId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SPRINT_COLUMN_NOT_FOUND));
        if (!col.getMilestone().getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.SPRINT_COLUMN_NOT_FOUND);
        }
        validateAccess(boardId);
        return col;
    }

    private void validateAccess(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        if (!board.canAccessMilestone()) {
            throw new BusinessException(ErrorCode.PREMIUM_FEATURE_REQUIRED);
        }
    }

    private Sprint createSprint(Milestone milestone, int seq) {
        Sprint sprint = Sprint.builder()
                .milestone(milestone)
                .name("Sprint " + seq)
                .sequenceNo(seq)
                .status(SprintStatus.ACTIVE)
                .build();
        return sprintRepository.save(sprint);
    }

    /**
     * 태스크 중 JIRA에 연동된 링크를 배치 조회(taskId → 링크).
     * JIRA 미연동 보드면 빈 맵(추가 쿼리 없음). 링크에서 이슈 키 + 실제 JIRA 상태 id를 얻는다.
     */
    private Map<String, JiraIssueLink> resolveJiraLinks(String boardId, List<Task> tasks) {
        if (jiraIntegrationConfigRepository.findActiveByBoardId(boardId).isEmpty()) {
            return Map.of();
        }
        List<String> taskIds = tasks.stream().map(Task::getId).distinct().toList();
        if (taskIds.isEmpty()) {
            return Map.of();
        }
        Map<String, JiraIssueLink> map = new HashMap<>();
        for (JiraIssueLink link : jiraIssueLinkRepository
                .findByBoardIdAndTargetTypeAndTargetIdIn(boardId, JiraLinkTargetType.TASK, taskIds)) {
            map.put(link.getTargetId(), link);
        }
        return map;
    }

    /**
     * 진척 단위 = 체크리스트 한 줄. 스프린트 게이지는 "태스크 몇 개 끝냈나"가 아니라
     * "그 안의 체크리스트가 몇 줄 끝났나"로 잰다 — 태스크로 세면 28줄짜리와 1줄짜리가
     * 같은 무게가 되어 실제 진척이 게이지에 드러나지 않는다.
     *  · 체크리스트가 없는 태스크는 1줄로 환산한다(태스크 자체가 하나의 할 일).
     *  · Done(END) 도달 태스크는 남은 줄과 무관하게 전부 완료로 센다 — 그래야 100%에 닿는다.
     * @return [done, total]
     */
    private int[] progressUnits(List<ChecklistItem> checklists, boolean done) {
        int total = Math.max(checklists.size(), 1);
        if (done) {
            return new int[] {total, total};
        }
        int d = 0;
        for (ChecklistItem c : checklists) {
            if (Boolean.TRUE.equals(c.getIsCompleted())) {
                d++;
            }
        }
        return new int[] {d, total};
    }

    /** 스프린트 전체의 체크리스트 줄 진척([done, total]) — 종료/재활성화 시 동결 수치 계산용. */
    private int[] sprintProgressUnits(String sprintId) {
        Map<String, List<ChecklistItem>> byTask =
                groupByTask(checklistItemRepository.findByTaskSprintId(sprintId));
        int done = 0;
        int total = 0;
        for (Task t : taskRepository.findBySprintId(sprintId)) {
            SprintColumn col = t.getSprintColumn();
            int[] u = progressUnits(byTask.getOrDefault(t.getId(), List.of()), col != null && col.isEnd());
            done += u[0];
            total += u[1];
        }
        return new int[] {done, total};
    }

    private SprintResponse.Board buildBoard(Milestone milestone, String userId) {
        String milestoneId = milestone.getId();
        List<Sprint> sprints = sprintRepository.findByMilestoneIdOrderBySequenceNoAsc(milestoneId);
        List<SprintColumn> cols = sprintColumnRepository.findByMilestoneIdOrderByPositionAsc(milestoneId);

        // 가장 최근 활성 스프린트 (동시에 1개 원칙, 방어적으로 최대 seq 선택)
        Sprint active = null;
        for (Sprint s : sprints) {
            if (s.isActive()) {
                active = s;
            }
        }

        // 마일스톤 전체 체크리스트를 한 번만 읽어 태스크별 진척 집계에 재사용한다 (담긴 카드 + 백로그 공통).
        Map<String, List<ChecklistItem>> checklistsByTask =
                groupByTask(checklistItemRepository.findByTaskMilestoneId(milestoneId));

        SprintResponse.SprintInfo activeInfo = null;
        List<SprintResponse.Column> columnDtos;
        SprintResponse.Gauge gauge;

        if (active != null) {
            List<Task> tasks = taskRepository.findBySprintId(active.getId());
            // JIRA 뷰(컬럼=JIRA 상태)용 — 연동 보드일 때만 JIRA 링크를 배치 조회(N+1 방지)
            Map<String, JiraIssueLink> jiraLinkByTaskId = resolveJiraLinks(milestone.getBoard().getId(), tasks);
            Map<String, List<SprintResponse.ItemCard>> byCol = new LinkedHashMap<>();
            for (SprintColumn c : cols) {
                byCol.put(c.getId(), new ArrayList<>());
            }
            String fallbackColId = cols.isEmpty() ? null : cols.get(0).getId();
            int unitDone = 0;
            int unitTotal = 0;
            for (Task t : tasks) {
                List<ChecklistItem> cls = checklistsByTask.getOrDefault(t.getId(), List.of());
                JiraIssueLink jiraLink = jiraLinkByTaskId.get(t.getId());
                SprintResponse.ItemCard card = SprintResponse.ItemCard.of(
                        t,
                        cls,
                        jiraLink != null ? jiraLink.getJiraIssueKey() : null,
                        jiraLink != null ? jiraLink.getLastJiraStatusId() : null);
                SprintColumn tc = t.getSprintColumn();
                if (tc != null && byCol.containsKey(tc.getId())) {
                    byCol.get(tc.getId()).add(card);
                } else if (fallbackColId != null) {
                    byCol.get(fallbackColId).add(card);
                }
                int[] u = progressUnits(cls, tc != null && tc.isEnd());
                unitDone += u[0];
                unitTotal += u[1];
            }
            columnDtos = cols.stream()
                    .map(c -> SprintResponse.Column.of(c, byCol.get(c.getId())))
                    .toList();
            gauge = SprintResponse.Gauge.of(unitDone, unitTotal);
            activeInfo = SprintResponse.SprintInfo.of(active, gauge.getPercentage());
        } else {
            columnDtos = cols.stream()
                    .map(c -> SprintResponse.Column.of(c, List.of()))
                    .toList();
            gauge = SprintResponse.Gauge.of(0, 0);
        }

        // 타임라인: 활성=위에서 잰 라이브 게이지(체크리스트 줄 기준), 아카이브=종료 시점 동결 수치
        List<SprintResponse.SprintInfo> timeline = new ArrayList<>();
        for (Sprint s : sprints) {
            int pct = s.isActive()
                    ? gauge.getPercentage()
                    : (s.getTotalCount() > 0
                            ? Math.round(s.getCompletedCount() * 100f / s.getTotalCount())
                            : 0);
            timeline.add(SprintResponse.SprintInfo.of(s, pct));
        }

        List<SprintResponse.ItemCard> backlog = taskRepository.findSprintBacklogByMilestoneId(milestoneId)
                .stream()
                .map(t -> SprintResponse.ItemCard.of(t, checklistsByTask.getOrDefault(t.getId(), List.of())))
                .toList();

        // JIRA 뷰(컬럼=JIRA 상태)용 — 스프린트 담김과 무관한 보드 전체 JIRA 연동 Task.
        String boardId = milestone.getBoard().getId();
        List<SprintResponse.JiraTask> jiraTasks = buildJiraTasks(boardId);

        return SprintResponse.Board.builder()
                .sprintEnabled(Boolean.TRUE.equals(milestone.getSprintEnabled()))
                .activeSprint(activeInfo)
                .sprints(timeline)
                .gauge(gauge)
                .columns(columnDtos)
                .backlog(backlog)
                .jiraTasks(jiraTasks)
                .jiraLastSeenAt(resolveJiraLastSeenAt(boardId, userId, jiraTasks.isEmpty()))
                .build();
    }

    /**
     * JIRA 신규 뱃지의 기준선. 값이 없는 멤버(=연동 후 첫 진입)는 <b>now로 초기화</b>해서
     * 기존 이슈 전체가 한꺼번에 신규로 잡히는 것을 막는다.
     *
     * <p>초기화는 실제로 볼 이슈가 있을 때만 한다. 미연동 보드에서 기준선을 미리 박아두면
     * 나중에 연동했을 때 그 사이 import된 이슈가 통째로 "이미 본 것"이 되기 때문이다.
     */
    private LocalDateTime resolveJiraLastSeenAt(String boardId, String userId, boolean noJiraTasks) {
        if (userId == null) {
            return null;
        }
        return boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .map(member -> {
                    if (!noJiraTasks) {
                        member.initJiraSeenIfAbsent(); // 더티 체킹으로 반영 (호출부는 모두 쓰기 트랜잭션)
                    }
                    return member.getJiraLastSeenAt();
                })
                .orElse(null);
    }

    /** JIRA 뷰를 확인 처리 — 기준선을 now로 밀어 신규 카운트를 0으로 만든다. */
    @Transactional
    public void markJiraSeen(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        boardMemberRepository.findByBoardIdAndUserId(boardId, userId)
                .ifPresent(BoardMember::markJiraSeen);
    }

    /**
     * JIRA 뷰(보드 스코프) 카드 목록. 보드의 모든 JIRA 연동 Task를 스프린트 담김 여부와 무관하게
     * 내려준다 — 재동기화로 import된 이슈가 스프린트에 담기지 않아도 JIRA 컬럼에 바로 보이도록.
     * 미연동 보드면 빈 목록(추가 쿼리 없음).
     */
    private List<SprintResponse.JiraTask> buildJiraTasks(String boardId) {
        if (jiraIntegrationConfigRepository.findActiveByBoardId(boardId).isEmpty()) {
            return List.of();
        }
        List<JiraIssueLink> links = jiraIssueLinkRepository
                .findByBoardIdAndTargetType(boardId, JiraLinkTargetType.TASK);
        if (links.isEmpty()) {
            return List.of();
        }
        List<String> taskIds = links.stream()
                .map(JiraIssueLink::getTargetId).distinct().toList();

        // Task(제목/블록/피쳐/QA) + 체크리스트(진행도·담당자) 배치 조회(N+1 방지).
        Map<String, Task> taskById = new HashMap<>();
        for (Task t : taskRepository.findByIdInWithBlockAndFeature(taskIds)) {
            taskById.put(t.getId(), t);
        }
        Map<String, List<ChecklistItem>> checklistsByTask =
                groupByTask(checklistItemRepository.findByTaskIdInWithAssignee(taskIds));

        List<SprintResponse.JiraTask> out = new ArrayList<>();
        for (JiraIssueLink link : links) {
            Task task = taskById.get(link.getTargetId());
            if (task == null) continue; // 고아 링크(Task 삭제됨) 방어
            List<ChecklistItem> cls = checklistsByTask.getOrDefault(task.getId(), List.of());
            int total = cls.size();
            int done = 0;
            Map<String, SprintResponse.AssigneeInfo> assignees = new LinkedHashMap<>();
            for (ChecklistItem c : cls) {
                if (Boolean.TRUE.equals(c.getIsCompleted())) done++;
                if (c.getAssignee() != null) {
                    assignees.putIfAbsent(c.getAssignee().getId(),
                            SprintResponse.AssigneeInfo.of(c.getAssignee()));
                }
            }
            out.add(SprintResponse.JiraTask.builder()
                    .taskId(task.getId())
                    .taskTitle(task.getTitle())
                    .jiraIssueKey(link.getJiraIssueKey())
                    .qaState(task.getQaState() != null ? task.getQaState().name() : null)
                    .blockId(task.getBlock() != null ? task.getBlock().getId() : null)
                    .jiraStatusId(link.getLastJiraStatusId())
                    .featureId(task.getFeature() != null ? task.getFeature().getId() : null)
                    .assignees(new ArrayList<>(assignees.values()))
                    .done(done)
                    .total(total)
                    .linkedAt(link.getCreatedAt())
                    .jiraDeleted(link.isJiraDeleted())
                    .jiraIssueType(link.getJiraIssueType())
                    .jiraPriority(link.getJiraPriority())
                    .jiraUpdatedAt(link.getJiraUpdatedAt())
                    .build());
        }
        return out;
    }
}
