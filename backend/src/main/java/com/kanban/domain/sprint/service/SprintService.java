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
import com.kanban.domain.integration.jira.JiraMilestoneScope;
import com.kanban.domain.integration.jira.JiraMilestoneScopeRepository;
import com.kanban.domain.milestone.MilestoneFeatureRepository;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.sprint.Sprint;
import com.kanban.domain.sprint.SprintColumn;
import com.kanban.domain.sprint.SprintColumnKind;
import com.kanban.domain.sprint.SprintColumnRepository;
import com.kanban.domain.sprint.SprintRepository;
import com.kanban.domain.sprint.SprintState;
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

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 스프린트 보드 서비스.
 *
 * <p>담기 단위는 <b>태스크</b>다. 체크리스트는 태스크에 딸린 내용물이라 따로 담지 않으며,
 * 태스크가 스프린트에 들어가 있으면 그 뒤에 추가된 체크리스트도 자동으로 같은 스프린트 안에 있게 된다.
 *
 * <p>예외로 체크리스트 <b>줄</b>은 태스크와 다른 스프린트로 보낼 수 있다({@code checklist_items.sprint_id}).
 * 보낸 줄은 그 스프린트에 "부분 카드"({@code partial=true}, id = taskId@sprintId)로 서고, 게이지·이월은
 * 줄이 실제로 속한 스프린트({@code ChecklistItem.effectiveSprint()}) 기준으로 센다.
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
    private final MilestoneFeatureRepository milestoneFeatureRepository;
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
    private final JiraMilestoneScopeRepository jiraMilestoneScopeRepository;

    // 기본 컬럼 시드 (앞뒤 고정 + 기본 중간 1개)
    private static final String COL_SPRINT = "Sprint";
    private static final String COL_REVIEW = "In Review";
    private static final String COL_DONE = "Done";

    /** 분할 상한. FE는 6개까지 노출하지만 서버는 여유를 둔다. */
    private static final int MAX_SPRINT_COUNT = 12;

    // ==================== Read ====================

    @Transactional
    public SprintResponse.Board getSprintBoard(String boardId, String milestoneId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        Milestone milestone = loadMilestone(boardId, milestoneId);

        // 레벨 1(시간 묶음 없음)에도 흐름 컬럼(In Review·Done)은 있어야 한다 —
        // 일은 마감이 없어도 흐른다. 흐름 컬럼이 SprintColumn이므로 레벨과 무관하게 프로비저닝한다.
        // sprintEnabled는 이제 사용자 개념이 아니라 내부 값이고, 사용자에게 보이는 건 boards.ui_level뿐이다.
        //
        // 그래서 프로비저닝에는 어떤 게이트도 두지 않는다. 예전엔 `uiLevel <= 1 || sprintEnabled`로 막았는데,
        // 신규 마일스톤이 sprintEnabled=false로 생성되는 탓에 **레벨 2·3 보드에서 만든 마일스톤은 영영
        // 스프린트를 못 갖는** 상태가 됐다. "스프린트 0개"는 도달할 수 없어야 하는 상태다 —
        // 마일스톤은 스프린트를 자동으로 소유한다(V20260713_030914 마이그레이션의 원래 의도).
        ensureColumns(milestone);
        ensureSprint(milestone);
        ensureSprintDates(milestone);
        if (resolveUiLevel(milestone) <= 1) {
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
        Sprint current = resolveCurrentSprint(
                sprintRepository.findByMilestoneIdOrderBySequenceNoAsc(milestone.getId()));
        if (current == null) {
            return;
        }
        SprintColumn start = requireColumn(milestone, SprintColumnKind.START);
        backlog.forEach(task -> task.assignToSprint(current, start));
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
            ensureSprint(milestone);
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
        normalizeOverrides(checklistItemRepository.findByTaskIdOrderByPositionAsc(taskId));
        broadcastSprintChanged(boardId, userId);
        return buildBoard(milestone, userId);
    }

    // ==================== 줄 단위 스프린트 지정 (멤버+) ====================

    /**
     * 체크리스트 줄을 태스크와 다른 스프린트로 보내거나(sprintId) 되돌린다(null).
     * 태스크의 스프린트와 같은 값은 지정을 지워 상속으로 정규화한다.
     */
    @Transactional
    public SprintResponse.Board setChecklistSprint(String boardId, List<String> itemIds, String sprintId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        if (itemIds == null || itemIds.isEmpty()) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }
        List<ChecklistItem> items = checklistItemRepository.findByIdInWithTaskAndSprint(itemIds);
        if (items.size() != new HashSet<>(itemIds).size()) {
            throw new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND);
        }
        Sprint target = sprintId == null ? null : loadSprint(boardId, sprintId);
        Milestone milestone = null;
        for (ChecklistItem c : items) {
            Task t = c.getTask();
            if (t == null || t.getBoard() == null || !t.getBoard().getId().equals(boardId)) {
                throw new BusinessException(ErrorCode.TASK_NOT_FOUND);
            }
            Milestone tm = t.getMilestone();
            if (tm == null) {
                throw new BusinessException(ErrorCode.SPRINT_TASK_NOT_IN_MILESTONE);
            }
            if (target != null && !tm.getId().equals(target.getMilestone().getId())) {
                throw new BusinessException(ErrorCode.SPRINT_TASK_NOT_IN_MILESTONE);
            }
            if (milestone == null) {
                milestone = tm;
            } else if (!milestone.getId().equals(tm.getId())) {
                throw new BusinessException(ErrorCode.SPRINT_TASK_NOT_IN_MILESTONE);
            }
            c.assignSprint(target);
        }
        ensureColumns(milestone);
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

    // ==================== 분할 (관리자) ====================

    /**
     * 마일스톤을 N개 스프린트 버킷으로 분할하거나 분할을 조정한다.
     *
     * <p>경계(boundaries)는 스프린트 2..N의 시작일 목록이다. 비어 있으면 마일스톤 기간을
     * 일수 기준으로 균등 분배한다. 기존 스프린트 행은 순서대로 재사용해 태스크 FK가 보존되고,
     * 개수가 줄면 잘려나간 스프린트의 태스크는 마지막 유지 스프린트로 흡수된다.
     *
     * <p>taskDistribution:
     *  · null/"keep"  = 담긴 태스크 배정 유지 (기본)
     *  · "unassign"   = 전부 백로그로 (업무 리스트에서 직접 담기)
     *  · "by_date"    = 태스크 시작일이 속한 버킷으로 자동 배치
     */
    @Transactional
    public SprintResponse.Board splitSprints(String boardId, String milestoneId, int count,
                                             List<LocalDate> boundaries, String taskDistribution,
                                             String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Milestone milestone = loadMilestone(boardId, milestoneId);
        ensureColumns(milestone);

        LocalDate msStart = milestone.getStartDate();
        LocalDate msEnd = milestone.getEndDate();
        if (count < 1 || count > MAX_SPRINT_COUNT
                || msStart == null || msEnd == null || msEnd.isBefore(msStart)) {
            throw new BusinessException(ErrorCode.SPRINT_SPLIT_INVALID);
        }

        List<LocalDate> cuts = (boundaries == null || boundaries.isEmpty())
                ? equalBoundaries(msStart, msEnd, count)
                : boundaries;
        if (cuts.size() != count - 1) {
            throw new BusinessException(ErrorCode.SPRINT_SPLIT_INVALID);
        }
        LocalDate prev = msStart;
        for (LocalDate cut : cuts) {
            if (cut == null || !cut.isAfter(prev) || cut.isAfter(msEnd)) {
                throw new BusinessException(ErrorCode.SPRINT_SPLIT_INVALID);
            }
            prev = cut;
        }

        // 기존 행 재사용(태스크 FK 보존) + 부족분 생성
        List<Sprint> existing = sprintRepository.findByMilestoneIdOrderBySequenceNoAsc(milestoneId);
        List<Sprint> buckets = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            LocalDate segStart = i == 0 ? msStart : cuts.get(i - 1);
            LocalDate segEnd = i == count - 1 ? msEnd : cuts.get(i).minusDays(1);
            Sprint bucket;
            if (i < existing.size()) {
                bucket = existing.get(i);
                bucket.updateSequence(i + 1);
            } else {
                bucket = createSprint(milestone, i + 1, segStart, segEnd);
            }
            bucket.updatePeriod(segStart, segEnd);
            buckets.add(bucket);
        }

        // 초과분 정리 — 담긴 태스크는 마지막 유지 스프린트로 흡수 (이월 카운트는 올리지 않는다)
        if (existing.size() > count) {
            Sprint lastKept = buckets.get(count - 1);
            for (int i = count; i < existing.size(); i++) {
                Sprint removed = existing.get(i);
                taskRepository.findBySprintId(removed.getId())
                        .forEach(t -> t.assignToSprint(lastKept, t.getSprintColumn()));
                // 사라지는 버킷을 가리키던 줄 지정은 상속으로 되돌린다(FK SET NULL과 같은 결과를 세션 안에서 보장).
                checklistItemRepository.clearSprintOverrideBySprintId(removed.getId());
                sprintRepository.delete(removed);
            }
        }

        applyTaskDistribution(milestone, buckets, taskDistribution);
        // 태스크가 옮겨진 뒤 지정값이 태스크와 같아진 줄은 지정을 지운다.
        normalizeOverrides(checklistItemRepository.findByTaskMilestoneId(milestoneId));

        log.info("Milestone {} split into {} sprints (distribution={})", milestoneId, count, taskDistribution);
        broadcastSprintChanged(boardId, userId);
        return buildBoard(milestone, userId);
    }

    /**
     * 지난 스프린트의 미완료를 다음 스프린트로 보낸다 — <b>줄 단위</b>.
     * 자동 이월의 대체로, 사람이 정리 시점을 정하는 액션이다.
     *
     * <ul>
     *   <li>itemIds/taskIds 가 모두 null 이면 이 스프린트의 미완료 줄 전부(+체크리스트 없는 미완료 태스크)가 대상.</li>
     *   <li>홈 태스크의 미완료 줄이 전부 대상이면 태스크 자체를 옮긴다(carryOverCount +1).
     *       이때 이미 끝낸 줄은 지난 스프린트에 지정으로 남겨 기록이 비지 않게 한다.</li>
     *   <li>일부만 대상이면 그 줄만 다음 스프린트로 지정한다 — 태스크는 제자리, 다음 스프린트엔 부분 카드.</li>
     *   <li>다른 태스크에서 이 스프린트로 보내온 줄(부분 카드의 줄)은 지정만 다음으로 바꾼다.</li>
     * </ul>
     */
    @Transactional
    public SprintResponse.Board pushUnfinished(String boardId, String sprintId,
                                               List<String> itemIds, List<String> taskIds, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Sprint sprint = loadSprint(boardId, sprintId);
        Milestone milestone = sprint.getMilestone();
        Sprint next = sprintRepository.findByMilestoneIdOrderBySequenceNoAsc(milestone.getId()).stream()
                .filter(s -> s.getSequenceNo() > sprint.getSequenceNo())
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.SPRINT_NO_NEXT_SPRINT));
        ensureColumns(milestone);
        SprintColumn start = requireColumn(milestone, SprintColumnKind.START);

        boolean selective = itemIds != null || taskIds != null;
        Set<String> wantItems = itemIds == null ? Set.of() : new HashSet<>(itemIds);
        Set<String> wantTasks = taskIds == null ? Set.of() : new HashSet<>(taskIds);

        // 이 스프린트에 속한 줄(홈 상속 + 지정으로 보내온 줄) 중 미완료
        List<ChecklistItem> sprintLines = checklistItemRepository.findByTaskSprintId(sprintId);
        Map<String, List<ChecklistItem>> unfinishedByTask = new LinkedHashMap<>();
        for (ChecklistItem c : sprintLines) {
            if (Boolean.TRUE.equals(c.getIsCompleted()) || c.getTask() == null) {
                continue;
            }
            unfinishedByTask.computeIfAbsent(c.getTask().getId(), k -> new ArrayList<>()).add(c);
        }
        // 태스크가 체크리스트를 하나라도 갖는지(=줄 없는 태스크 판정)는 마일스톤 전체 줄로 본다.
        Map<String, List<ChecklistItem>> allByTask =
                groupByTask(checklistItemRepository.findByTaskMilestoneId(milestone.getId()));

        int movedTasks = 0;
        int movedLines = 0;
        // 1) 홈 태스크(이 스프린트에 담긴 태스크, END 미도달)
        for (Task t : taskRepository.findNotDoneBySprintId(sprintId, SprintColumnKind.END)) {
            List<ChecklistItem> all = allByTask.getOrDefault(t.getId(), List.of());
            if (all.isEmpty()) {
                // 줄이 없는 태스크는 태스크 자체가 한 줄 — 태스크 단위로만 보낼 수 있다.
                if (!selective || wantTasks.contains(t.getId())) {
                    t.carryOverTo(next, start);
                    movedTasks++;
                }
                continue;
            }
            List<ChecklistItem> unfinishedHome = unfinishedByTask.getOrDefault(t.getId(), List.of());
            if (unfinishedHome.isEmpty()) {
                continue; // 이 스프린트 몫은 다 끝났다 — 옮길 게 없다(Done 컬럼 이동은 사람이 한다)
            }
            List<ChecklistItem> selected = selective
                    ? unfinishedHome.stream().filter(c -> wantItems.contains(c.getId())).toList()
                    : unfinishedHome;
            if (selected.isEmpty()) {
                continue;
            }
            if (selected.size() == unfinishedHome.size()) {
                // 미완료 몫 전부 → 태스크 이동. 끝낸 줄은 지난 스프린트에 남긴다.
                t.carryOverTo(next, start);
                movedTasks++;
                for (ChecklistItem c : all) {
                    if (c.isSprintOverridden()) {
                        // 다음 스프린트로 미리 보내둔 줄은 이제 태스크와 같아졌으니 지정을 지운다.
                        if (next.getId().equals(c.getSprint().getId())) {
                            c.assignSprint(next);
                        }
                    } else if (Boolean.TRUE.equals(c.getIsCompleted())) {
                        c.assignSprint(sprint);
                    }
                }
            } else {
                for (ChecklistItem c : selected) {
                    c.assignSprint(next);
                    movedLines++;
                }
            }
        }
        // 2) 다른 태스크에서 이 스프린트로 보내온 줄(홈이 여기가 아닌 태스크의 줄)
        for (List<ChecklistItem> lines : unfinishedByTask.values()) {
            for (ChecklistItem c : lines) {
                Task t = c.getTask();
                boolean homeHere = t.getSprint() != null && sprintId.equals(t.getSprint().getId());
                if (homeHere || !c.isSprintOverridden()) {
                    continue;
                }
                if (!selective || wantItems.contains(c.getId())) {
                    c.assignSprint(next);
                    movedLines++;
                }
            }
        }
        log.info("Sprint {} — {} tasks / {} lines pushed to {}",
                sprint.getName(), movedTasks, movedLines, next.getName());
        broadcastSprintChanged(boardId, userId);
        return buildBoard(milestone, userId);
    }

    /** 특정 스프린트에 담긴 태스크 카드 목록 (아카이브 열람 / 재개 UI용) */
    public List<SprintResponse.ItemCard> getSprintTasks(String boardId, String sprintId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        Sprint sprint = loadSprint(boardId, sprintId);
        Milestone milestone = sprint.getMilestone();
        List<Sprint> sprints = sprintRepository.findByMilestoneIdOrderBySequenceNoAsc(milestone.getId());
        List<SprintColumn> cols = sprintColumnRepository.findByMilestoneIdOrderByPositionAsc(milestone.getId());
        Map<String, List<ChecklistItem>> byTask =
                groupByTask(checklistItemRepository.findByTaskMilestoneId(milestone.getId()));
        List<SprintResponse.ItemCard> out = new ArrayList<>();
        for (Task t : taskRepository.findAllByMilestoneIdWithSprint(milestone.getId())) {
            for (SprintResponse.ItemCard card : assembleCards(t, byTask.getOrDefault(t.getId(), List.of()),
                    sprints, cols, null, null)) {
                if (sprintId.equals(card.getSprintId())) {
                    out.add(card);
                }
            }
        }
        return out;
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
        Map<String, Integer> seq = seqBySprintId(sprintRepository.findByMilestoneIdOrderBySequenceNoAsc(milestoneId));
        // 콘솔은 태스크 트리라 부분 카드를 만들지 않는다 — 태스크 한 장에 줄 전체(각 줄에 귀속 스프린트 표기).
        return taskRepository.findAllByMilestoneIdWithSprint(milestoneId).stream()
                .map(t -> SprintResponse.ItemCard.home(t, byTask.getOrDefault(t.getId(), List.of()),
                        null, null, List.of(), seq))
                .toList();
    }

    // ==================== Helpers ====================

    private Map<String, Integer> seqBySprintId(List<Sprint> sprints) {
        Map<String, Integer> m = new HashMap<>();
        for (Sprint sp : sprints) {
            m.put(sp.getId(), sp.getSequenceNo());
        }
        return m;
    }

    /** 지정값이 태스크의 스프린트와 같아진 줄의 지정을 지운다(상속으로 정규화). */
    private void normalizeOverrides(List<ChecklistItem> items) {
        for (ChecklistItem c : items) {
            if (!c.isSprintOverridden() || c.getTask() == null) {
                continue;
            }
            Sprint ts = c.getTask().getSprint();
            if (ts != null && ts.getId().equals(c.getSprint().getId())) {
                c.assignSprint(null);
            }
        }
    }

    /**
     * 태스크의 줄을 "홈 몫"과 "다른 스프린트로 보낸 몫"으로 나눈다.
     * 홈 = 태스크의 스프린트(백로그면 null). 이 마일스톤에 없는 스프린트를 가리키는 지정은 홈으로 취급한다.
     */
    private record LineSplit(List<ChecklistItem> home, Map<String, List<ChecklistItem>> foreign) {}

    private LineSplit splitLines(Task t, List<ChecklistItem> all, Map<String, Sprint> sprintById) {
        String homeId = t.getSprint() != null ? t.getSprint().getId() : null;
        List<ChecklistItem> home = new ArrayList<>();
        Map<String, List<ChecklistItem>> foreign = new LinkedHashMap<>();
        for (ChecklistItem c : all) {
            Sprint eff = c.effectiveSprint();
            String effId = eff != null ? eff.getId() : null;
            if (effId == null || effId.equals(homeId) || !sprintById.containsKey(effId)) {
                home.add(c);
            } else {
                foreign.computeIfAbsent(effId, k -> new ArrayList<>()).add(c);
            }
        }
        return new LineSplit(home, foreign);
    }

    /**
     * 태스크 한 건을 카드로 편다 — 첫 장은 홈 카드(태스크가 담긴 스프린트/백로그), 뒤는 보낸 줄이 있는
     * 스프린트마다 부분 카드 한 장. 부분 카드의 컬럼은 저장하지 않고 파생한다(전부 완료 → END, 아니면 START).
     */
    private List<SprintResponse.ItemCard> assembleCards(Task t, List<ChecklistItem> all,
                                                        List<Sprint> sprints, List<SprintColumn> cols,
                                                        String jiraIssueKey, String jiraStatusId) {
        Map<String, Sprint> sprintById = new HashMap<>();
        for (Sprint sp : sprints) {
            sprintById.put(sp.getId(), sp);
        }
        Map<String, Integer> seq = seqBySprintId(sprints);
        SprintColumn startCol = cols.stream().filter(SprintColumn::isStart).findFirst().orElse(null);
        SprintColumn endCol = cols.stream().filter(SprintColumn::isEnd).findFirst().orElse(null);

        LineSplit split = splitLines(t, all, sprintById);
        List<SprintResponse.SliceCount> counts = new ArrayList<>();
        for (Map.Entry<String, List<ChecklistItem>> e : split.foreign().entrySet()) {
            int done = (int) e.getValue().stream().filter(c -> Boolean.TRUE.equals(c.getIsCompleted())).count();
            counts.add(SprintResponse.SliceCount.builder()
                    .sprintId(e.getKey())
                    .sprintSeq(seq.get(e.getKey()))
                    .total(e.getValue().size())
                    .done(done)
                    .build());
        }
        counts.sort((a, b) -> Integer.compare(
                a.getSprintSeq() == null ? 0 : a.getSprintSeq(),
                b.getSprintSeq() == null ? 0 : b.getSprintSeq()));

        List<SprintResponse.ItemCard> out = new ArrayList<>();
        out.add(SprintResponse.ItemCard.home(t, split.home(), jiraIssueKey, jiraStatusId, counts, seq));
        for (Map.Entry<String, List<ChecklistItem>> e : split.foreign().entrySet()) {
            Sprint slice = sprintById.get(e.getKey());
            boolean allDone = e.getValue().stream().allMatch(c -> Boolean.TRUE.equals(c.getIsCompleted()));
            out.add(SprintResponse.ItemCard.slice(t, e.getValue(), slice, allDone ? endCol : startCol, seq));
        }
        return out;
    }

    /**
     * 홈 카드의 진척 단위. 태스크에 줄이 하나도 없으면 태스크 자체가 한 줄(1/1)이고,
     * 줄은 있는데 전부 다른 스프린트로 보냈으면 이 스프린트 몫은 0이다(1로 환산하면 유령 분모가 생긴다).
     */
    private int[] homeUnits(List<ChecklistItem> all, List<ChecklistItem> home, boolean done) {
        if (all.isEmpty()) {
            return progressUnits(home, done);
        }
        if (home.isEmpty()) {
            return new int[] {0, 0};
        }
        return progressUnits(home, done);
    }

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

    /** 스프린트가 하나도 없으면 마일스톤 전체 기간을 덮는 Sprint 1(나누지 않음 상태) 자동 생성 */
    private void ensureSprint(Milestone milestone) {
        if (sprintRepository.findMaxSequenceNo(milestone.getId()) == 0) {
            createSprint(milestone, 1, milestone.getStartDate(), milestone.getEndDate());
        }
    }

    /**
     * 기간 없는 스프린트에 기간을 소급 부여한다 — 라이프사이클 시절 만들어진 행의 지연 백필.
     * 마일스톤 기간을 스프린트 수만큼 균등 분배한다 (조회 트랜잭션의 더티 체킹으로 반영).
     */
    private void ensureSprintDates(Milestone milestone) {
        List<Sprint> sprints = sprintRepository.findByMilestoneIdOrderBySequenceNoAsc(milestone.getId());
        boolean missing = sprints.stream().anyMatch(s -> s.getStartDate() == null || s.getEndDate() == null);
        if (!missing || sprints.isEmpty()
                || milestone.getStartDate() == null || milestone.getEndDate() == null) {
            return;
        }
        List<LocalDate> cuts = equalBoundaries(milestone.getStartDate(), milestone.getEndDate(), sprints.size());
        for (int i = 0; i < sprints.size(); i++) {
            LocalDate segStart = i == 0 ? milestone.getStartDate() : cuts.get(i - 1);
            LocalDate segEnd = i == sprints.size() - 1 ? milestone.getEndDate() : cuts.get(i).minusDays(1);
            sprints.get(i).updatePeriod(segStart, segEnd);
        }
        log.info("Backfilled sprint dates: milestone={} count={}", milestone.getId(), sprints.size());
    }

    /**
     * 오늘이 속한 스프린트. 어디에도 속하지 않으면(경계 밖) 아직 지나지 않은 첫 스프린트,
     * 전부 지났으면 마지막 스프린트를 고른다.
     */
    private Sprint resolveCurrentSprint(List<Sprint> sprints) {
        if (sprints.isEmpty()) {
            return null;
        }
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        for (Sprint s : sprints) {
            if (s.stateOn(today) != SprintState.PAST) {
                return s;
            }
        }
        return sprints.get(sprints.size() - 1);
    }

    /** 균등 분배 경계 — 스프린트 2..N의 시작일. 일수 기준 비례 배분. (패키지 가시성: 테스트) */
    static List<LocalDate> equalBoundaries(LocalDate start, LocalDate end, int count) {
        long totalDays = ChronoUnit.DAYS.between(start, end) + 1;
        List<LocalDate> cuts = new ArrayList<>();
        for (int i = 1; i < count; i++) {
            cuts.add(start.plusDays(totalDays * i / count));
        }
        return cuts;
    }

    /** 분할 후 태스크 배분 옵션 적용 (keep=아무것도 안 함) */
    private void applyTaskDistribution(Milestone milestone, List<Sprint> buckets, String taskDistribution) {
        if ("unassign".equals(taskDistribution)) {
            taskRepository.findInSprintByMilestoneId(milestone.getId()).forEach(Task::removeFromSprint);
            return;
        }
        if (!"by_date".equals(taskDistribution)) {
            return;
        }
        SprintColumn start = requireColumn(milestone, SprintColumnKind.START);
        for (Task t : taskRepository.findInSprintByMilestoneId(milestone.getId())) {
            Sprint bucket = bucketFor(buckets, t.getStartDate());
            if (bucket != null && (t.getSprint() == null || !bucket.getId().equals(t.getSprint().getId()))) {
                t.assignToSprint(bucket, t.getSprintColumn() != null ? t.getSprintColumn() : start);
            }
        }
    }

    /** 날짜가 속한 버킷. 날짜 없음/기간 앞 = 첫 버킷, 기간 뒤 = 마지막 버킷. */
    private Sprint bucketFor(List<Sprint> buckets, LocalDate date) {
        if (buckets.isEmpty()) {
            return null;
        }
        if (date == null) {
            return buckets.get(0);
        }
        for (Sprint s : buckets) {
            if (s.getEndDate() != null && !date.isAfter(s.getEndDate())) {
                return s;
            }
        }
        return buckets.get(buckets.size() - 1);
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

    private Sprint createSprint(Milestone milestone, int seq, LocalDate startDate, LocalDate endDate) {
        Sprint sprint = Sprint.builder()
                .milestone(milestone)
                .name("Sprint " + seq)
                .sequenceNo(seq)
                .startDate(startDate)
                .endDate(endDate)
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

    private SprintResponse.Board buildBoard(Milestone milestone, String userId) {
        String milestoneId = milestone.getId();
        List<Sprint> sprints = sprintRepository.findByMilestoneIdOrderBySequenceNoAsc(milestoneId);
        List<SprintColumn> cols = sprintColumnRepository.findByMilestoneIdOrderByPositionAsc(milestoneId);
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        Sprint current = resolveCurrentSprint(sprints);

        // 마일스톤 전체 체크리스트를 한 번만 읽어 태스크별 진척 집계에 재사용한다 (담긴 카드 + 백로그 공통).
        Map<String, List<ChecklistItem>> checklistsByTask =
                groupByTask(checklistItemRepository.findByTaskMilestoneId(milestoneId));

        // 분할 모델: 컬럼에는 모든 스프린트의 카드를 담아 내려준다 — 카드마다 sprint_id가 붙어 있어
        // FE가 선택된 스프린트로 즉시 필터링한다 (스프린트 전환에 재조회 없음).
        List<Task> allTasks = taskRepository.findAllByMilestoneIdWithSprint(milestoneId);
        List<Task> inSprint = allTasks.stream().filter(Task::isInSprint).toList();

        // JIRA 뷰(컬럼=JIRA 상태)용 — 연동 보드일 때만 JIRA 링크를 배치 조회(N+1 방지)
        Map<String, JiraIssueLink> jiraLinkByTaskId = resolveJiraLinks(milestone.getBoard().getId(), inSprint);

        Map<String, List<SprintResponse.ItemCard>> byCol = new LinkedHashMap<>();
        for (SprintColumn c : cols) {
            byCol.put(c.getId(), new ArrayList<>());
        }
        String fallbackColId = cols.isEmpty() ? null : cols.get(0).getId();
        Map<String, int[]> unitsBySprint = new HashMap<>();
        Map<String, Sprint> sprintById = new HashMap<>();
        for (Sprint sp : sprints) {
            sprintById.put(sp.getId(), sp);
        }
        // 카드를 컬럼에 놓는다 — 홈 카드는 저장된 컬럼, 부분 카드는 파생 컬럼(START/END).
        java.util.function.BiConsumer<SprintResponse.ItemCard, String> place = (card, colId) -> {
            if (colId != null && byCol.containsKey(colId)) {
                byCol.get(colId).add(card);
            } else if (fallbackColId != null) {
                byCol.get(fallbackColId).add(card);
            }
        };
        java.util.function.BiConsumer<String, int[]> accumulate = (sprintId, u) -> {
            int[] acc = unitsBySprint.computeIfAbsent(sprintId, k -> new int[2]);
            acc[0] += u[0];
            acc[1] += u[1];
        };
        List<SprintResponse.ItemCard> backlog = new ArrayList<>();
        for (Task t : allTasks) {
            List<ChecklistItem> cls = checklistsByTask.getOrDefault(t.getId(), List.of());
            JiraIssueLink jiraLink = jiraLinkByTaskId.get(t.getId());
            List<SprintResponse.ItemCard> cards = assembleCards(t, cls, sprints, cols,
                    jiraLink != null ? jiraLink.getJiraIssueKey() : null,
                    jiraLink != null ? jiraLink.getLastJiraStatusId() : null);
            SprintResponse.ItemCard home = cards.get(0);
            if (t.isInSprint()) {
                SprintColumn tc = t.getSprintColumn();
                place.accept(home, tc != null ? tc.getId() : null);
                List<ChecklistItem> homeLines = splitLines(t, cls, sprintById).home();
                accumulate.accept(t.getSprint().getId(), homeUnits(cls, homeLines, tc != null && tc.isEnd()));
            } else {
                backlog.add(home);
            }
            // 부분 카드 — 보낸 줄이 있는 스프린트마다 한 장. 게이지도 그 몫만 그 스프린트에 더한다.
            for (int i = 1; i < cards.size(); i++) {
                SprintResponse.ItemCard slice = cards.get(i);
                place.accept(slice, slice.getSprintColumnId());
                accumulate.accept(slice.getSprintId(),
                        new int[] {slice.isCompleted() ? slice.getChecklistTotal() : slice.getChecklistDone(),
                                slice.getChecklistTotal()});
            }
        }

        List<SprintResponse.Column> columnDtos = cols.stream()
                .map(c -> SprintResponse.Column.of(c, byCol.get(c.getId())))
                .toList();

        // 타임라인: 스프린트별 라이브 게이지(체크리스트 줄 기준) + 날짜 파생 상태
        List<SprintResponse.SprintInfo> timeline = new ArrayList<>();
        for (Sprint s : sprints) {
            int[] u = unitsBySprint.getOrDefault(s.getId(), new int[2]);
            timeline.add(SprintResponse.SprintInfo.of(s, u[0], u[1], s.stateOn(today)));
        }

        SprintResponse.SprintInfo currentInfo = null;
        SprintResponse.Gauge gauge;
        if (current != null) {
            int[] u = unitsBySprint.getOrDefault(current.getId(), new int[2]);
            gauge = SprintResponse.Gauge.of(u[0], u[1]);
            currentInfo = SprintResponse.SprintInfo.of(current, u[0], u[1], current.stateOn(today));
        } else {
            gauge = SprintResponse.Gauge.of(0, 0);
        }

        // JIRA 뷰(컬럼=JIRA 상태)용 — 마일스톤에 활성 스코프가 있으면 그 소속만,
        // 없으면 기존처럼 보드 전체(스프린트 담김 무관)를 비춘다.
        String boardId = milestone.getBoard().getId();
        JiraMilestoneScope jiraScope = jiraMilestoneScopeRepository
                .findActiveByMilestoneId(milestone.getId()).orElse(null);
        List<SprintResponse.JiraTask> jiraTasks = buildJiraTasks(boardId, jiraScope);

        // 사이드바가 태스크 없는 피쳐까지 노출할 수 있도록 피쳐 목록을 함께 내려준다 —
        // 단, 보드 전체가 아니라 "이 마일스톤에 연결된" 피쳐만. 다른 마일스톤 소속 피쳐까지
        // 태스크 0으로 백로그에 세우면 이 마일스톤과 무관한 소음이 된다.
        List<SprintResponse.FeatureInfo> boardFeatures = milestoneFeatureRepository
                .findFeaturesByMilestoneId(milestone.getId()).stream()
                .filter(f -> !Boolean.TRUE.equals(f.getIsInbox()))
                .map(SprintResponse.FeatureInfo::of)
                .toList();

        return SprintResponse.Board.builder()
                .sprintEnabled(Boolean.TRUE.equals(milestone.getSprintEnabled()))
                .currentSprint(currentInfo)
                .sprints(timeline)
                .gauge(gauge)
                .columns(columnDtos)
                .backlog(backlog)
                .boardFeatures(boardFeatures)
                .jiraTasks(jiraTasks)
                .jiraLastSeenAt(resolveJiraLastSeenAt(boardId, userId, jiraTasks.isEmpty()))
                .jiraScope(jiraScope != null
                        ? SprintResponse.JiraScopeInfo.of(jiraScope, jiraTasks.size())
                        : null)
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
     * JIRA 뷰(컬럼=JIRA 상태) 카드 목록.
     *  · scope == null — 기존 동작: 보드의 모든 JIRA 연동 Task(스프린트 담김 무관).
     *  · scope != null — 마일스톤 스코프 소속(scope_id) 링크만. 스코프 JQL로 claim된 이슈만 비춘다.
     * 미연동 보드면 빈 목록(추가 쿼리 없음).
     */
    private List<SprintResponse.JiraTask> buildJiraTasks(String boardId, JiraMilestoneScope scope) {
        if (jiraIntegrationConfigRepository.findActiveByBoardId(boardId).isEmpty()) {
            return List.of();
        }
        List<JiraIssueLink> links = scope != null
                ? jiraIssueLinkRepository.findByBoardIdAndTargetTypeAndScopeId(
                        boardId, JiraLinkTargetType.TASK, scope.getId())
                : jiraIssueLinkRepository.findByBoardIdAndTargetType(boardId, JiraLinkTargetType.TASK);
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
