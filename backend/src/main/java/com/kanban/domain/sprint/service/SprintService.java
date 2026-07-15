package com.kanban.domain.sprint.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.checklist.dto.ChecklistResponse;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.sprint.Sprint;
import com.kanban.domain.sprint.SprintColumn;
import com.kanban.domain.sprint.SprintColumnKind;
import com.kanban.domain.sprint.SprintColumnRepository;
import com.kanban.domain.sprint.SprintRepository;
import com.kanban.domain.sprint.SprintStatus;
import com.kanban.domain.sprint.dto.SprintResponse;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SprintService {

    private final SprintRepository sprintRepository;
    private final SprintColumnRepository sprintColumnRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final MilestoneRepository milestoneRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final WebSocketEventService webSocketEventService;

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
            // 병합: 담긴 카드를 모두 백로그로 되돌리고 스프린트 삭제 (완료 여부는 유지, 컬럼 구성은 보존)
            List<ChecklistItem> inSprint = checklistItemRepository.findInSprintByMilestoneId(milestoneId);
            inSprint.forEach(ChecklistItem::removeFromSprint);
            sprintRepository.deleteByMilestoneId(milestoneId);
        }
        return buildBoard(milestone);
    }

    // ==================== 담기 / 빼기 / 이동 (멤버+) ====================

    @Transactional
    public SprintResponse.Board addItem(String boardId, String sprintId, String checklistItemId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        Sprint sprint = loadSprint(boardId, sprintId);
        ChecklistItem item = checklistItemRepository.findById(checklistItemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));

        // 항목이 스프린트와 같은 마일스톤에 속하는지 검증
        Milestone itemMilestone = item.getTask() != null ? item.getTask().getMilestone() : null;
        if (itemMilestone == null || !itemMilestone.getId().equals(sprint.getMilestone().getId())) {
            throw new BusinessException(ErrorCode.SPRINT_ITEM_NOT_IN_MILESTONE);
        }
        Milestone milestone = sprint.getMilestone();
        ensureColumns(milestone);
        // 완료 상태면 바로 Done(END), 아니면 Sprint(START)
        SprintColumn target = Boolean.TRUE.equals(item.getIsCompleted())
                ? requireColumn(milestone, SprintColumnKind.END)
                : requireColumn(milestone, SprintColumnKind.START);
        item.assignToSprint(sprint, target);
        return buildBoard(milestone);
    }

    @Transactional
    public SprintResponse.Board removeItem(String boardId, String sprintId, String itemId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        Sprint sprint = loadSprint(boardId, sprintId);
        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));
        item.removeFromSprint();
        return buildBoard(sprint.getMilestone());
    }

    /** 카드 컬럼 이동 (드래그). END 컬럼 도달 시 완료 동기화, 벗어나면 미완료로. */
    @Transactional
    public SprintResponse.Board moveToColumn(String boardId, String itemId, String columnId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));
        Sprint sprint = item.getSprint();
        if (sprint == null) {
            throw new BusinessException(ErrorCode.SPRINT_ITEM_NOT_IN_MILESTONE);
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
        boolean completionChanged = applyColumnMove(item, column, userId);
        // 완료 플래그가 바뀌었으면 일반 체크리스트 토글과 동일한 이벤트를 쏴서
        // 블록 보드·태스크 모달 등 다른 화면의 체크박스가 실시간 동기화되도록 한다.
        if (completionChanged) {
            broadcastChecklistToggle(boardId, item, userId);
        }
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
        List<ChecklistItem> items = checklistItemRepository.findBySprintColumnId(columnId);
        if (prev != null) {
            items.forEach(item -> item.moveToSprintColumn(prev));
        } else {
            items.forEach(ChecklistItem::removeFromSprint);
        }
        sprintColumnRepository.delete(col);
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
        return buildBoard(milestone);
    }

    // ==================== 라이프사이클: 종료 / 재활성화 (관리자) ====================

    @Transactional
    public SprintResponse.Board closeSprint(String boardId, String sprintId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        Sprint sprint = loadSprint(boardId, sprintId);
        if (!sprint.isActive()) {
            throw new BusinessException(ErrorCode.SPRINT_NOT_ACTIVE);
        }

        int total = checklistItemRepository.countBySprintId(sprintId);
        int done = checklistItemRepository.countBySprintIdAndColumnKind(sprintId, SprintColumnKind.END);
        if (total == 0 || done != total) {
            throw new BusinessException(ErrorCode.SPRINT_NOT_ALL_DONE);
        }

        Milestone milestone = sprint.getMilestone();
        String milestoneId = milestone.getId();
        sprint.archive(done, total, LocalDateTime.now(ZoneOffset.UTC));

        Sprint latest = sprintRepository.findFirstByMilestoneIdOrderBySequenceNoDesc(milestoneId)
                .orElse(sprint);
        if (latest.getId().equals(sprint.getId())) {
            int nextSeq = sprintRepository.findMaxSequenceNo(milestoneId) + 1;
            createSprint(milestone, nextSeq);
        } else {
            latest.reactivate();
        }
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
            int total = checklistItemRepository.countBySprintId(active.getId());
            int done = checklistItemRepository.countBySprintIdAndColumnKind(active.getId(), SprintColumnKind.END);
            active.archive(done, total, LocalDateTime.now(ZoneOffset.UTC));
        }

        target.reactivate();
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
        return buildBoard(milestone);
    }

    /** 항목 재개 — 아카이브(또는 다른) 스프린트의 항목을 현재 활성 스프린트로 다시 담는다 (Sprint 컬럼, 미완료로). */
    @Transactional
    public SprintResponse.Board resumeItem(String boardId, String itemId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        ChecklistItem item = checklistItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHECKLIST_ITEM_NOT_FOUND));
        Sprint from = item.getSprint();
        if (from == null) {
            throw new BusinessException(ErrorCode.SPRINT_ITEM_NOT_IN_MILESTONE);
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
        item.assignToSprint(active, requireColumn(milestone, SprintColumnKind.START));
        item.uncomplete();
        return buildBoard(milestone);
    }

    /** 특정 스프린트의 담긴 카드 목록 (아카이브 열람 / 항목 재개 UI용) */
    public List<SprintResponse.ItemCard> getSprintItems(String boardId, String sprintId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        loadSprint(boardId, sprintId);
        return checklistItemRepository.findBySprintId(sprintId).stream()
                .map(SprintResponse.ItemCard::of)
                .toList();
    }

    // ==================== 완료 토글 동기화 (ChecklistService에서 호출) ====================

    /**
     * 일반 체크리스트 완료 토글 후, 스프린트에 담긴 항목이면 컬럼을 동기화한다.
     * 완료 → END 컬럼 이동(+완료자 기록), 미완료 → END에서 직전 컬럼으로 되돌림.
     * (item 은 이미 toggle 반영된 managed 엔티티. 별도 save 불필요.)
     */
    @Transactional
    public void syncColumnOnToggle(ChecklistItem item, String userId) {
        if (!item.isInSprint()) {
            return;
        }
        String milestoneId = item.getSprint().getMilestone().getId();
        if (Boolean.TRUE.equals(item.getIsCompleted())) {
            sprintColumnRepository.findFirstByMilestoneIdAndKind(milestoneId, SprintColumnKind.END)
                    .ifPresent(end -> {
                        item.moveToSprintColumn(end);
                        item.recordCompleter(userRepository.getReferenceById(userId));
                    });
        } else {
            SprintColumn cur = item.getSprintColumn();
            if (cur != null && cur.isEnd()) {
                List<SprintColumn> cols = sprintColumnRepository.findByMilestoneIdOrderByPositionAsc(milestoneId);
                cols.stream().filter(c -> !c.isEnd()).reduce((a, b) -> b)
                        .ifPresent(item::moveToSprintColumn);
            }
        }
    }

    // ==================== Helpers ====================

    /** 컬럼 이동 + 완료 동기화. 완료 플래그가 실제로 바뀌었으면 true를 반환한다. */
    private boolean applyColumnMove(ChecklistItem item, SprintColumn column, String userId) {
        boolean before = Boolean.TRUE.equals(item.getIsCompleted());
        item.moveToSprintColumn(column);
        if (column.isEnd()) {
            item.complete();
            item.recordCompleter(userRepository.getReferenceById(userId));
        } else if (Boolean.TRUE.equals(item.getIsCompleted())) {
            item.uncomplete();
        }
        return before != Boolean.TRUE.equals(item.getIsCompleted());
    }

    /**
     * 스프린트 컬럼 이동으로 완료 상태가 바뀌면, 일반 체크리스트 토글(ChecklistService)과
     * 동일한 CHECKLIST_TOGGLED 이벤트를 브로드캐스트한다. 이벤트 payload({task_id, item})도 동일하게 맞춰
     * 블록 보드·태스크 모달·일정 뷰의 체크박스가 새로고침 없이 즉시 동기화되도록 한다.
     */
    private void broadcastChecklistToggle(String boardId, ChecklistItem item, String userId) {
        String taskId = item.getTask() != null ? item.getTask().getId() : null;
        if (taskId == null) {
            return;
        }
        ChecklistResponse.Detail detail = ChecklistResponse.Detail.of(item);
        String userName = userRepository.findById(userId).map(u -> u.getName()).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.CHECKLIST_TOGGLED, userId, userName,
                Map.of("task_id", taskId, "item", detail));
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

        // 타임라인: 활성=라이브 집계, 아카이브=동결 수치
        List<SprintResponse.SprintInfo> timeline = new ArrayList<>();
        for (Sprint s : sprints) {
            int pct;
            if (s.isActive()) {
                int total = checklistItemRepository.countBySprintId(s.getId());
                int done = checklistItemRepository.countBySprintIdAndColumnKind(s.getId(), SprintColumnKind.END);
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
            List<ChecklistItem> items = checklistItemRepository.findBySprintId(active.getId());
            Map<String, List<SprintResponse.ItemCard>> byCol = new LinkedHashMap<>();
            for (SprintColumn c : cols) {
                byCol.put(c.getId(), new ArrayList<>());
            }
            String fallbackColId = cols.isEmpty() ? null : cols.get(0).getId();
            int done = 0;
            for (ChecklistItem c : items) {
                SprintResponse.ItemCard card = SprintResponse.ItemCard.of(c);
                SprintColumn ic = c.getSprintColumn();
                if (ic != null && byCol.containsKey(ic.getId())) {
                    byCol.get(ic.getId()).add(card);
                    if (ic.isEnd()) {
                        done++;
                    }
                } else if (fallbackColId != null) {
                    byCol.get(fallbackColId).add(card);
                }
            }
            columnDtos = cols.stream()
                    .map(c -> SprintResponse.Column.of(c, byCol.get(c.getId())))
                    .toList();
            gauge = SprintResponse.Gauge.of(done, items.size());
            activeInfo = SprintResponse.SprintInfo.of(active, gauge.getPercentage());
        } else {
            columnDtos = cols.stream()
                    .map(c -> SprintResponse.Column.of(c, List.of()))
                    .toList();
            gauge = SprintResponse.Gauge.of(0, 0);
        }

        List<SprintResponse.ItemCard> backlog = checklistItemRepository.findBacklogByMilestoneId(milestoneId)
                .stream().map(SprintResponse.ItemCard::of).toList();

        return SprintResponse.Board.builder()
                .sprintEnabled(Boolean.TRUE.equals(milestone.getSprintEnabled()))
                .activeSprint(activeInfo)
                .sprints(timeline)
                .gauge(gauge)
                .columns(columnDtos)
                .backlog(backlog)
                .build();
    }
}
