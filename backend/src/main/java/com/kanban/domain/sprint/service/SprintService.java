package com.kanban.domain.sprint.service;

import com.kanban.domain.board.Board;
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
        // 마일스톤 = 스프린트 자동 소유: 활성화 상태면 컬럼/스프린트를 자동 프로비저닝
        if (Boolean.TRUE.equals(milestone.getSprintEnabled())) {
            ensureColumns(milestone);
            ensureActiveSprint(milestone);
        }
        return buildBoard(milestone);
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
        return buildBoard(milestone);
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
        return buildBoard(milestone);
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
        return buildBoard(sprint.getMilestone());
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
        return buildBoard(sprint.getMilestone());
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
        return buildBoard(milestone);
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
        return buildBoard(col.getMilestone());
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
        return buildBoard(milestone);
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
        return buildBoard(milestone);
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

        // 동결 수치는 이월 전에 센다 — "24/39 완료, 15개 이월"이 그대로 기록에 남는다.
        int total = taskRepository.countBySprintId(sprintId);
        int done = taskRepository.countBySprintIdAndColumnKind(sprintId, SprintColumnKind.END);
        sprint.archive(done, total, LocalDateTime.now(ZoneOffset.UTC));

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
        return buildBoard(milestone);
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
            int total = taskRepository.countBySprintId(active.getId());
            int done = taskRepository.countBySprintIdAndColumnKind(active.getId(), SprintColumnKind.END);
            active.archive(done, total, LocalDateTime.now(ZoneOffset.UTC));
        }

        target.reactivate();
        broadcastSprintChanged(boardId, userId);
        return buildBoard(milestone);
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
        return buildBoard(milestone);
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
        return buildBoard(milestone);
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

    private SprintResponse.Board buildBoard(Milestone milestone) {
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

        // 타임라인: 활성=라이브 집계, 아카이브=동결 수치
        List<SprintResponse.SprintInfo> timeline = new ArrayList<>();
        for (Sprint s : sprints) {
            int pct;
            if (s.isActive()) {
                int total = taskRepository.countBySprintId(s.getId());
                int done = taskRepository.countBySprintIdAndColumnKind(s.getId(), SprintColumnKind.END);
                pct = total > 0 ? Math.round(done * 100f / total) : 0;
            } else {
                pct = s.getTotalCount() > 0 ? Math.round(s.getCompletedCount() * 100f / s.getTotalCount()) : 0;
            }
            timeline.add(SprintResponse.SprintInfo.of(s, pct));
        }

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
            int done = 0;
            for (Task t : tasks) {
                JiraIssueLink jiraLink = jiraLinkByTaskId.get(t.getId());
                SprintResponse.ItemCard card = SprintResponse.ItemCard.of(
                        t,
                        checklistsByTask.getOrDefault(t.getId(), List.of()),
                        jiraLink != null ? jiraLink.getJiraIssueKey() : null,
                        jiraLink != null ? jiraLink.getLastJiraStatusId() : null);
                SprintColumn tc = t.getSprintColumn();
                if (tc != null && byCol.containsKey(tc.getId())) {
                    byCol.get(tc.getId()).add(card);
                    if (tc.isEnd()) {
                        done++;
                    }
                } else if (fallbackColId != null) {
                    byCol.get(fallbackColId).add(card);
                }
            }
            columnDtos = cols.stream()
                    .map(c -> SprintResponse.Column.of(c, byCol.get(c.getId())))
                    .toList();
            gauge = SprintResponse.Gauge.of(done, tasks.size());
            activeInfo = SprintResponse.SprintInfo.of(active, gauge.getPercentage());
        } else {
            columnDtos = cols.stream()
                    .map(c -> SprintResponse.Column.of(c, List.of()))
                    .toList();
            gauge = SprintResponse.Gauge.of(0, 0);
        }

        List<SprintResponse.ItemCard> backlog = taskRepository.findSprintBacklogByMilestoneId(milestoneId)
                .stream()
                .map(t -> SprintResponse.ItemCard.of(t, checklistsByTask.getOrDefault(t.getId(), List.of())))
                .toList();

        // JIRA 뷰(컬럼=JIRA 상태)용 — 스프린트 담김과 무관한 보드 전체 JIRA 연동 Task.
        List<SprintResponse.JiraTask> jiraTasks = buildJiraTasks(milestone.getBoard().getId());

        return SprintResponse.Board.builder()
                .sprintEnabled(Boolean.TRUE.equals(milestone.getSprintEnabled()))
                .activeSprint(activeInfo)
                .sprints(timeline)
                .gauge(gauge)
                .columns(columnDtos)
                .backlog(backlog)
                .jiraTasks(jiraTasks)
                .build();
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
                    .build());
        }
        return out;
    }
}
