package com.kanban.domain.planning.service;

import com.kanban.domain.activity.ActivityAction;
import com.kanban.domain.activity.TargetType;
import com.kanban.domain.activity.service.ActivityService;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneAllocation;
import com.kanban.domain.milestone.MilestoneAllocationRepository;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.planning.PlanningCard;
import com.kanban.domain.planning.PlanningCardRepository;
import com.kanban.domain.planning.dto.PlanningCardRequest.CreateRequest;
import com.kanban.domain.planning.dto.PlanningCardRequest.MoveRequest;
import com.kanban.domain.planning.dto.PlanningCardRequest.ReorderRequest;
import com.kanban.domain.planning.dto.PlanningCardRequest.UpdateRequest;
import com.kanban.domain.planning.dto.PlanningCardResponse.CardDto;
import com.kanban.domain.planning.dto.PlanningCardResponse.CellSummary;
import com.kanban.domain.planning.dto.PlanningCardResponse.ColumnTotal;
import com.kanban.domain.planning.dto.PlanningCardResponse.ListResponse;
import com.kanban.domain.planning.dto.PlanningCardResponse.MemberRef;
import com.kanban.domain.planning.dto.PlanningCardResponse.MilestoneRef;
import com.kanban.domain.planning.dto.PlanningCardResponse.PoolSummary;
import com.kanban.domain.planning.dto.PlanningCardResponse.RowTotal;
import com.kanban.domain.planning.dto.PlanningCardResponse.SummaryDto;
import com.kanban.domain.planning.dto.PlanningCardResponse.WeekInfo;
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

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Planning Card 도메인 서비스.
 * <p>
 * 핵심 비즈니스 로직:
 * <ul>
 *   <li>주 단위 capacity 계산 = {@code MilestoneAllocation.totalAllocatedHours / milestoneWeekCount}</li>
 *   <li>{@code primary_milestone_id} 계산: 주 시작일(월)이 속한 마일스톤</li>
 *   <li>capacity null → {@link com.kanban.global.util.UtilizationStatus#UNKNOWN}</li>
 * </ul>
 * <p>
 * WebSocket / ActivityLog 발행: create/update/move/delete 후 즉시 발행 (트랜잭션 내).
 * reorder 는 노이즈 방지 목적으로 ActivityLog 미기록 (WS 이벤트만 발행).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PlanningCardService {

    private static final int DEFAULT_WEEK_RANGE_WHEN_NO_MILESTONE = 12;

    private final PlanningCardRepository planningCardRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final MilestoneRepository milestoneRepository;
    private final MilestoneAllocationRepository milestoneAllocationRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final WebSocketEventService webSocketEventService;
    private final ActivityService activityService;

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * 보드의 모든 플래닝 카드 + 주차별 집계 반환.
     */
    public ListResponse getPlanningCards(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        // 보드 존재 검증
        boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // 1. 카드 조회 (assignee fetch join — N+1 방지)
        List<PlanningCard> cards = planningCardRepository.findByBoardIdWithAssignee(boardId);

        // 2. 마일스톤 / 할당 / 멤버 일괄 조회
        List<Milestone> milestones = milestoneRepository.findByBoardIdOrderByStartDateAsc(boardId);
        List<MilestoneAllocation> allocations = fetchAllocations(milestones);
        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);

        // 3. 주차 범위 계산
        List<LocalDate> weeks = computeWeekRange(milestones);

        // 4. 마일스톤별 주 수 / 멤버별 할당 맵
        Map<String, Integer> milestoneWeekCountMap = buildMilestoneWeekCountMap(milestones, weeks);
        // milestoneId → (memberId → totalAllocatedHours)
        Map<String, Map<String, Double>> allocMap = buildAllocationMap(allocations);

        // 5. 카드 DTO 변환
        List<CardDto> cardDtos = cards.stream()
                .sorted(Comparator.comparing(PlanningCard::getPosition))
                .map(CardDto::from)
                .collect(Collectors.toList());

        // 6. Summary 구성
        SummaryDto summary = buildSummary(
                cards, weeks, milestones, members,
                milestoneWeekCountMap, allocMap
        );

        return new ListResponse(cardDtos, summary);
    }

    @Transactional
    public CardDto createCard(String boardId, String userId, CreateRequest req) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        LocalDate weekStart = req.weekStartDate();
        if (weekStart != null) {
            validateMonday(weekStart);
        }

        User assignee = null;
        if (req.assigneeId() != null && !req.assigneeId().isBlank()) {
            assignee = loadAndValidateBoardMember(boardId, req.assigneeId());
        }

        Milestone primaryMilestone = null;
        if (weekStart != null) {
            List<Milestone> milestones = milestoneRepository.findByBoardIdOrderByStartDateAsc(boardId);
            primaryMilestone = calculatePrimaryMilestone(weekStart, milestones);
        }

        // position 기본값: 해당 셀(또는 풀)의 최대 position + 1
        int position = req.position() != null
                ? req.position()
                : nextPositionForCell(boardId, weekStart, req.assigneeId());

        PlanningCard card = PlanningCard.builder()
                .board(board)
                .title(req.title())
                .description(req.description())
                .assignee(assignee)
                .weekStartDate(weekStart)
                .primaryMilestone(primaryMilestone)
                .estimatedHours(req.estimatedHours())
                .color(req.color())
                .position(position)
                .createdBy(creator)
                .build();

        PlanningCard saved = planningCardRepository.save(card);
        log.info("Planning card created: {} in board: {} by user: {}", saved.getId(), boardId, userId);

        // WebSocket 이벤트 발행
        Map<String, Object> wsPayload = new HashMap<>();
        wsPayload.put("card_id", saved.getId());
        wsPayload.put("title", saved.getTitle());
        wsPayload.put("assignee_id", saved.getAssignee() != null ? saved.getAssignee().getId() : null);
        wsPayload.put("week_start_date", saved.getWeekStartDate() != null ? saved.getWeekStartDate().toString() : null);
        publishCardEvent(boardId, userId, creator.getName(), BoardEventType.PLANNING_CARD_CREATED, wsPayload);

        // ActivityLog 저장
        Map<String, Object> activityMeta = new HashMap<>();
        activityMeta.put("cardTitle", saved.getTitle());
        activityMeta.put("weekStartDate", saved.getWeekStartDate() != null ? saved.getWeekStartDate().toString() : null);
        activityMeta.put("assigneeId", saved.getAssignee() != null ? saved.getAssignee().getId() : null);
        activityService.logActivity(board, creator, ActivityAction.PLANNING_CARD_CREATED,
                TargetType.PLANNING_CARD, saved.getId(), activityMeta);

        return CardDto.from(saved);
    }

    @Transactional
    public CardDto updateCard(String boardId, String cardId, String userId, UpdateRequest req) {
        boardService.checkMemberOrAbove(boardId, userId);

        PlanningCard card = findCardOrThrow(boardId, cardId);
        card.updateContent(req.title(), req.description(), req.estimatedHours(), req.color());

        log.info("Planning card updated: {} by user: {}", cardId, userId);

        // WebSocket 이벤트 발행
        Map<String, Object> wsPayload = new HashMap<>();
        wsPayload.put("card_id", card.getId());
        wsPayload.put("title", card.getTitle());
        wsPayload.put("estimated_hours", card.getEstimatedHours());
        wsPayload.put("color", card.getColor());
        User updater = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        publishCardEvent(boardId, userId, updater.getName(), BoardEventType.PLANNING_CARD_UPDATED, wsPayload);

        // ActivityLog 저장
        Map<String, Object> activityMeta = new HashMap<>();
        activityMeta.put("cardTitle", card.getTitle());
        activityService.logActivity(card.getBoard(), updater, ActivityAction.PLANNING_CARD_UPDATED,
                TargetType.PLANNING_CARD, cardId, activityMeta);

        return CardDto.from(card);
    }

    @Transactional
    public CardDto moveCard(String boardId, String cardId, String userId, MoveRequest req) {
        boardService.checkMemberOrAbove(boardId, userId);

        PlanningCard card = findCardOrThrow(boardId, cardId);

        // 이동 전 상태 캡처 (WS 이벤트 payload 및 ActivityLog metadata에 사용)
        LocalDate oldWeek = card.getWeekStartDate();
        String oldAssigneeId = card.getAssignee() != null ? card.getAssignee().getId() : null;
        Integer oldPosition = card.getPosition();

        LocalDate weekStart = req.weekStartDate();
        if (weekStart != null) {
            validateMonday(weekStart);
        }

        User assignee = null;
        if (req.assigneeId() != null && !req.assigneeId().isBlank()) {
            assignee = loadAndValidateBoardMember(boardId, req.assigneeId());
        }

        Milestone primaryMilestone = null;
        if (weekStart != null) {
            List<Milestone> milestones = milestoneRepository.findByBoardIdOrderByStartDateAsc(boardId);
            primaryMilestone = calculatePrimaryMilestone(weekStart, milestones);
        }

        Integer position = req.position() != null
                ? req.position()
                : nextPositionForCell(boardId, weekStart, req.assigneeId());

        card.moveTo(assignee, weekStart, primaryMilestone, position);

        log.info("Planning card moved: {} → (week={}, assignee={}, pos={}) by user: {}",
                cardId, weekStart, req.assigneeId(), position, userId);

        // WebSocket 이벤트 발행 (기획서 §4.6: from/to 구조)
        Map<String, Object> fromPayload = new HashMap<>();
        fromPayload.put("week_start_date", oldWeek != null ? oldWeek.toString() : null);
        fromPayload.put("assignee_id", oldAssigneeId);
        fromPayload.put("position", oldPosition);

        Map<String, Object> toPayload = new HashMap<>();
        toPayload.put("week_start_date", weekStart != null ? weekStart.toString() : null);
        toPayload.put("assignee_id", req.assigneeId());
        toPayload.put("position", position);

        Map<String, Object> wsPayload = new HashMap<>();
        wsPayload.put("card_id", cardId);
        wsPayload.put("from", fromPayload);
        wsPayload.put("to", toPayload);

        User mover = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        publishCardEvent(boardId, userId, mover.getName(), BoardEventType.PLANNING_CARD_MOVED, wsPayload);

        // ActivityLog 저장
        Map<String, Object> activityMeta = new HashMap<>();
        activityMeta.put("cardTitle", card.getTitle());
        activityMeta.put("fromWeek", oldWeek != null ? oldWeek.toString() : null);
        activityMeta.put("toWeek", weekStart != null ? weekStart.toString() : null);
        activityMeta.put("fromAssignee", oldAssigneeId);
        activityMeta.put("toAssignee", req.assigneeId());
        activityService.logActivity(card.getBoard(), mover, ActivityAction.PLANNING_CARD_MOVED,
                TargetType.PLANNING_CARD, cardId, activityMeta);

        return CardDto.from(card);
    }

    @Transactional
    public void reorderCards(String boardId, String userId, ReorderRequest req) {
        boardService.checkMemberOrAbove(boardId, userId);

        LocalDate weekStart = req.weekStartDate();
        if (weekStart != null) {
            validateMonday(weekStart);
        }

        List<String> cardIds = req.cardIds();
        List<PlanningCard> cards = planningCardRepository.findAllById(cardIds);

        if (cards.size() != cardIds.size()) {
            throw new BusinessException(ErrorCode.PLANNING_CARD_NOT_FOUND);
        }

        // PL002: 전부 같은 보드인지 검증
        for (PlanningCard card : cards) {
            if (!card.getBoard().getId().equals(boardId)) {
                throw new BusinessException(ErrorCode.PLANNING_CARD_BOARD_MISMATCH);
            }
        }

        // PL004: 모든 카드가 동일 셀(weekStart × assignee)인지 검증
        String expectedAssigneeId = (req.assigneeId() != null && !req.assigneeId().isBlank())
                ? req.assigneeId() : null;
        for (PlanningCard card : cards) {
            String actualAssigneeId = card.getAssignee() != null ? card.getAssignee().getId() : null;
            LocalDate actualWeek = card.getWeekStartDate();
            if (!Objects.equals(actualWeek, weekStart) || !Objects.equals(actualAssigneeId, expectedAssigneeId)) {
                throw new BusinessException(ErrorCode.PLANNING_CARD_REORDER_MISMATCH);
            }
        }

        // 인덱스 맵으로 빠른 조회
        Map<String, PlanningCard> cardMap = cards.stream()
                .collect(Collectors.toMap(PlanningCard::getId, c -> c));

        for (int i = 0; i < cardIds.size(); i++) {
            PlanningCard c = cardMap.get(cardIds.get(i));
            c.moveTo(c.getAssignee(), c.getWeekStartDate(), c.getPrimaryMilestone(), i);
        }

        log.info("Planning cards reordered: {} cards in cell (week={}, assignee={}) by user: {}",
                cardIds.size(), weekStart, expectedAssigneeId, userId);

        // WebSocket 이벤트 발행 (REORDERED는 ActivityLog 미기록 — 노이즈 방지)
        Map<String, Object> wsPayload = new HashMap<>();
        wsPayload.put("week_start_date", weekStart != null ? weekStart.toString() : null);
        wsPayload.put("assignee_id", expectedAssigneeId);
        wsPayload.put("card_ids", cardIds);

        User reorderer = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        publishCardEvent(boardId, userId, reorderer.getName(), BoardEventType.PLANNING_CARDS_REORDERED, wsPayload);
    }

    @Transactional
    public void deleteCard(String boardId, String cardId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        PlanningCard card = findCardOrThrow(boardId, cardId);

        // 삭제 전 정보 캡처 (삭제 후 접근 불가)
        String cardTitle = card.getTitle();
        Board board = card.getBoard();

        planningCardRepository.delete(card);

        log.info("Planning card deleted: {} by user: {}", cardId, userId);

        // WebSocket 이벤트 발행
        Map<String, Object> wsPayload = new HashMap<>();
        wsPayload.put("card_id", cardId);

        User deleter = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        publishCardEvent(boardId, userId, deleter.getName(), BoardEventType.PLANNING_CARD_DELETED, wsPayload);

        // ActivityLog 저장
        Map<String, Object> activityMeta = new HashMap<>();
        activityMeta.put("cardTitle", cardTitle);
        activityService.logActivity(board, deleter, ActivityAction.PLANNING_CARD_DELETED,
                TargetType.PLANNING_CARD, cardId, activityMeta);
    }

    // =========================================================================
    // Private Utilities — Validation / Lookup
    // =========================================================================

    private void validateMonday(LocalDate date) {
        if (date.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw new BusinessException(ErrorCode.PLANNING_CARD_INVALID_WEEK);
        }
    }

    /**
     * assignee가 해당 보드의 멤버인지 검증 후 User 반환.
     */
    private User loadAndValidateBoardMember(String boardId, String assigneeId) {
        BoardMember membership = boardMemberRepository.findByBoardIdAndUserId(boardId, assigneeId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT_VALUE));
        return membership.getUser();
    }

    private PlanningCard findCardOrThrow(String boardId, String cardId) {
        PlanningCard card = planningCardRepository.findById(cardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PLANNING_CARD_NOT_FOUND));
        if (!card.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.PLANNING_CARD_BOARD_MISMATCH);
        }
        return card;
    }

    private int nextPositionForCell(String boardId, LocalDate weekStart, String assigneeId) {
        // assigneeId / weekStart 가 모두 null (풀)이면 별도 처리 불가한 쿼리 — 전체 조회로 대체
        List<PlanningCard> siblings;
        if (weekStart == null && (assigneeId == null || assigneeId.isBlank())) {
            siblings = planningCardRepository.findByBoardIdOrderByPositionAsc(boardId)
                    .stream()
                    .filter(c -> c.getWeekStartDate() == null && c.getAssignee() == null)
                    .collect(Collectors.toList());
        } else if (assigneeId != null && !assigneeId.isBlank() && weekStart != null) {
            siblings = planningCardRepository
                    .findByBoardIdAndWeekStartDateAndAssigneeIdOrderByPositionAsc(boardId, weekStart, assigneeId);
        } else {
            // 부분 셀 (weekStart 만 있거나, assignee 만 있는 경우) — 전체 필터링
            siblings = planningCardRepository.findByBoardIdOrderByPositionAsc(boardId)
                    .stream()
                    .filter(c -> Objects.equals(c.getWeekStartDate(), weekStart)
                            && Objects.equals(c.getAssignee() != null ? c.getAssignee().getId() : null, assigneeId))
                    .collect(Collectors.toList());
        }
        return siblings.stream()
                .mapToInt(c -> c.getPosition() != null ? c.getPosition() : 0)
                .max()
                .orElse(-1) + 1;
    }

    // =========================================================================
    // Private Utilities — Week / Milestone
    // =========================================================================

    /**
     * 주 시작일(월)이 속한 마일스톤을 반환. 갭 주나 마일스톤 없음 → null.
     * 시작일 기준으로 가장 먼저 매치되는 마일스톤을 반환하므로,
     * milestones 는 startDate ASC 정렬 상태로 전달되어야 한다.
     */
    Milestone calculatePrimaryMilestone(LocalDate weekStart, List<Milestone> milestones) {
        if (weekStart == null || milestones == null || milestones.isEmpty()) {
            return null;
        }
        return milestones.stream()
                .filter(m -> m.getStartDate() != null && m.getEndDate() != null)
                .filter(m -> !weekStart.isBefore(m.getStartDate()) && !weekStart.isAfter(m.getEndDate()))
                .findFirst()
                .orElse(null);
    }

    /**
     * 모든 마일스톤의 min(start) ~ max(end) 범위를 월요일 경계로 확장한 연속 주차 목록.
     * 마일스톤이 없으면 "이번 주부터 12주" 기본 범위.
     */
    List<LocalDate> computeWeekRange(List<Milestone> milestones) {
        if (milestones == null || milestones.isEmpty()) {
            LocalDate thisMonday = LocalDate.now(ZoneOffset.UTC)
                    .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            List<LocalDate> defaults = new ArrayList<>(DEFAULT_WEEK_RANGE_WHEN_NO_MILESTONE);
            for (int i = 0; i < DEFAULT_WEEK_RANGE_WHEN_NO_MILESTONE; i++) {
                defaults.add(thisMonday.plusWeeks(i));
            }
            return defaults;
        }

        Optional<LocalDate> minStartOpt = milestones.stream()
                .map(Milestone::getStartDate)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder());
        Optional<LocalDate> maxEndOpt = milestones.stream()
                .map(Milestone::getEndDate)
                .filter(Objects::nonNull)
                .max(Comparator.naturalOrder());

        if (minStartOpt.isEmpty() || maxEndOpt.isEmpty()) {
            LocalDate thisMonday = LocalDate.now(ZoneOffset.UTC)
                    .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            List<LocalDate> defaults = new ArrayList<>(DEFAULT_WEEK_RANGE_WHEN_NO_MILESTONE);
            for (int i = 0; i < DEFAULT_WEEK_RANGE_WHEN_NO_MILESTONE; i++) {
                defaults.add(thisMonday.plusWeeks(i));
            }
            return defaults;
        }

        LocalDate firstMonday = minStartOpt.get().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate lastMonday = maxEndOpt.get().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));

        List<LocalDate> weeks = new ArrayList<>();
        for (LocalDate d = firstMonday; !d.isAfter(lastMonday); d = d.plusWeeks(1)) {
            weeks.add(d);
        }
        return weeks;
    }

    // =========================================================================
    // Private Utilities — Summary / Capacity
    // =========================================================================

    private List<MilestoneAllocation> fetchAllocations(List<Milestone> milestones) {
        if (milestones.isEmpty()) {
            return List.of();
        }
        List<MilestoneAllocation> all = new ArrayList<>();
        for (Milestone m : milestones) {
            all.addAll(milestoneAllocationRepository.findByMilestoneIdWithMember(m.getId()));
        }
        return all;
    }

    /**
     * milestoneId → 이 마일스톤에 속한 주(weeks 리스트 내) 수.
     * capacity 분배(총 시간 / 주 수)의 분모로 사용.
     */
    private Map<String, Integer> buildMilestoneWeekCountMap(
            List<Milestone> milestones, List<LocalDate> weeks) {
        Map<String, Integer> map = new HashMap<>();
        for (Milestone m : milestones) {
            int count = 0;
            for (LocalDate w : weeks) {
                Milestone primary = calculatePrimaryMilestone(w, milestones);
                if (primary != null && primary.getId().equals(m.getId())) {
                    count++;
                }
            }
            map.put(m.getId(), count);
        }
        return map;
    }

    /**
     * milestoneId → (memberId → totalAllocatedHours)
     */
    private Map<String, Map<String, Double>> buildAllocationMap(List<MilestoneAllocation> allocations) {
        Map<String, Map<String, Double>> map = new HashMap<>();
        for (MilestoneAllocation a : allocations) {
            String milestoneId = a.getMilestone().getId();
            String memberId = a.getMember().getId();
            Double total = a.getTotalAllocatedHours();
            map.computeIfAbsent(milestoneId, k -> new HashMap<>()).put(memberId, total);
        }
        return map;
    }

    /**
     * 셀 capacity = allocation.totalAllocatedHours / milestoneWeekCount.
     * primary 마일스톤 없거나 allocation 없거나 주 수 0이면 null (UNKNOWN).
     */
    Double calculateCellCapacity(
            String assigneeId,
            LocalDate weekStart,
            List<Milestone> milestones,
            Map<String, Map<String, Double>> allocMap,
            Map<String, Integer> milestoneWeekCountMap
    ) {
        if (assigneeId == null || weekStart == null) {
            return null;
        }
        Milestone primary = calculatePrimaryMilestone(weekStart, milestones);
        if (primary == null) {
            return null;
        }
        Map<String, Double> memberAllocs = allocMap.get(primary.getId());
        if (memberAllocs == null) {
            return null;
        }
        Double total = memberAllocs.get(assigneeId);
        if (total == null) {
            return null;
        }
        Integer weekCount = milestoneWeekCountMap.get(primary.getId());
        if (weekCount == null || weekCount == 0) {
            return null;
        }
        return total / weekCount;
    }

    private SummaryDto buildSummary(
            List<PlanningCard> cards,
            List<LocalDate> weeks,
            List<Milestone> milestones,
            List<BoardMember> members,
            Map<String, Integer> milestoneWeekCountMap,
            Map<String, Map<String, Double>> allocMap
    ) {
        // --- WeekInfo
        List<WeekInfo> weekInfos = weeks.stream()
                .map(w -> {
                    Milestone primary = calculatePrimaryMilestone(w, milestones);
                    return new WeekInfo(
                            w,
                            w.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR),
                            primary != null ? primary.getId() : null
                    );
                })
                .collect(Collectors.toList());

        // --- MilestoneRefs (progress 는 SA-007/추후 단계에서 위임 — 여기서는 0)
        List<MilestoneRef> milestoneRefs = milestones.stream()
                .map(m -> MilestoneRef.of(m, 0))
                .collect(Collectors.toList());

        // --- MemberRefs (display_order ASC, joined_at ASC)
        List<MemberRef> memberRefs = members.stream()
                .map(bm -> MemberRef.from(bm.getUser()))
                .collect(Collectors.toList());

        // --- 셀별 load 집계: (weekStart, assigneeId) → [count, sumHours]
        // LinkedHashMap 으로 Cell 이 결정론적 순서를 갖도록 구성
        Map<String, CellAgg> cellAgg = new LinkedHashMap<>();
        double poolLoad = 0.0;
        int poolCount = 0;

        for (PlanningCard card : cards) {
            Double hours = card.getEstimatedHours() != null ? card.getEstimatedHours() : 0.0;
            LocalDate w = card.getWeekStartDate();
            User a = card.getAssignee();
            String assigneeId = a != null ? a.getId() : null;

            if (w == null || assigneeId == null) {
                poolLoad += hours;
                poolCount++;
                continue;
            }
            String key = w + "|" + assigneeId;
            cellAgg.computeIfAbsent(key, k -> new CellAgg(w, assigneeId))
                    .add(hours);
        }

        // --- CellSummary: 카드 있는 셀 + 멤버/주차 전 조합 (capacity 있는 셀도 노출)
        // 과부하 시각화를 위해 카드 없는 셀도 allocation 존재 시 노출 (capacity 없어도 0/unknown 렌더)
        // 기획 §3.5: row/column total 계산을 위해 전 셀을 순회한다.
        List<CellSummary> cells = new ArrayList<>();
        Map<String, Double> rowLoadMap = new HashMap<>();       // assigneeId → 누적 load
        Map<String, Double> rowCapacityMap = new HashMap<>();   // assigneeId → 누적 capacity
        Map<LocalDate, Double> colLoadMap = new HashMap<>();    // week → 누적 load
        Map<LocalDate, Double> colCapacityMap = new HashMap<>(); // week → 누적 capacity

        for (BoardMember bm : members) {
            String memberId = bm.getUser().getId();
            for (LocalDate w : weeks) {
                String key = w + "|" + memberId;
                CellAgg agg = cellAgg.get(key);
                int count = agg != null ? agg.count : 0;
                double load = agg != null ? agg.sumHours : 0.0;
                Double capacity = calculateCellCapacity(
                        memberId, w, milestones, allocMap, milestoneWeekCountMap);

                // 카드 있거나 capacity 있는 셀만 노출 (빈 UNKNOWN 은 생략하여 payload 축소)
                if (count > 0 || capacity != null) {
                    cells.add(CellSummary.of(w, memberId, count, load, capacity));
                }

                rowLoadMap.merge(memberId, load, Double::sum);
                colLoadMap.merge(w, load, Double::sum);
                if (capacity != null) {
                    rowCapacityMap.merge(memberId, capacity, Double::sum);
                    colCapacityMap.merge(w, capacity, Double::sum);
                }
            }
        }

        // --- RowTotals (멤버 순서 유지)
        List<RowTotal> rowTotals = members.stream()
                .map(bm -> {
                    String memberId = bm.getUser().getId();
                    double load = rowLoadMap.getOrDefault(memberId, 0.0);
                    Double cap = rowCapacityMap.get(memberId);
                    return RowTotal.of(memberId, load, cap);
                })
                .collect(Collectors.toList());

        // --- ColumnTotals (주차 순서 유지)
        List<ColumnTotal> columnTotals = weeks.stream()
                .map(w -> {
                    double load = colLoadMap.getOrDefault(w, 0.0);
                    Double cap = colCapacityMap.get(w);
                    return ColumnTotal.of(w, load, cap);
                })
                .collect(Collectors.toList());

        PoolSummary pool = PoolSummary.of(poolCount, poolLoad);

        return new SummaryDto(
                weekInfos, milestoneRefs, memberRefs,
                cells, rowTotals, columnTotals, pool
        );
    }

    // =========================================================================
    // Private Utilities — Event Publishing
    // =========================================================================

    /**
     * WebSocket 보드 이벤트 발행 헬퍼.
     * WebSocket 실패 시 비즈니스 로직에 영향 없도록 내부에서 try-catch 처리됨
     * ({@link WebSocketEventService#sendBoardEvent} 참조).
     */
    private void publishCardEvent(String boardId, String userId, String userName,
                                  BoardEventType type, Map<String, Object> data) {
        webSocketEventService.sendBoardEvent(boardId, type, userId, userName, data);
    }

    /**
     * Cell 집계용 내부 가변 홀더.
     */
    private static final class CellAgg {
        final LocalDate weekStart;
        final String assigneeId;
        int count = 0;
        double sumHours = 0.0;

        CellAgg(LocalDate weekStart, String assigneeId) {
            this.weekStart = weekStart;
            this.assigneeId = assigneeId;
        }

        void add(double hours) {
            this.count++;
            this.sumHours += hours;
        }
    }
}
