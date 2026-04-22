package com.kanban.domain.planning.service;

import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.planning.PlanningCard;
import com.kanban.domain.planning.PlanningCardRepository;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 마일스톤 기간 변경 또는 삭제 시 PlanningCard의 primary_milestone_id를
 * week_start_date 기준으로 재계산한다.
 *
 * <p>순환 참조 방지: PlanningCardService를 주입하지 않고
 * PlanningCardRepository와 MilestoneRepository를 직접 사용한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlanningCardRecomputeService {

    private final PlanningCardRepository planningCardRepository;
    private final MilestoneRepository milestoneRepository;
    private final WebSocketEventService webSocketEventService;

    /**
     * 특정 보드의 모든 PlanningCard의 primary_milestone_id를
     * week_start_date 기준으로 재계산한다.
     *
     * <p>마일스톤 기간 변경(update) 또는 삭제(delete) 시 호출된다.
     * week_start_date가 null인 카드(풀 상태)는 재계산 대상에서 제외된다.
     *
     * @param boardId 재계산할 보드 ID
     */
    @Transactional
    public void recomputeForBoard(String boardId) {
        List<PlanningCard> cards = planningCardRepository.findByBoardIdOrderByPositionAsc(boardId)
                .stream()
                .filter(c -> c.getWeekStartDate() != null)
                .toList();

        if (cards.isEmpty()) {
            log.debug("PlanningCardRecompute: no cards with week_start_date in board={}", boardId);
            return;
        }

        List<Milestone> milestones = milestoneRepository.findByBoardIdOrderByStartDateAsc(boardId);
        int updatedCount = 0;

        for (PlanningCard card : cards) {
            Milestone newPrimary = calculatePrimaryMilestone(card.getWeekStartDate(), milestones);
            Milestone oldPrimary = card.getPrimaryMilestone();
            String oldId = oldPrimary != null ? oldPrimary.getId() : null;
            String newId = newPrimary != null ? newPrimary.getId() : null;

            if (!Objects.equals(oldId, newId)) {
                card.reindexPrimaryMilestone(newPrimary);
                updatedCount++;
            }
        }

        log.info("PlanningCardRecompute: board={}, total={}, updated={}", boardId, cards.size(), updatedCount);

        if (updatedCount > 0) {
            webSocketEventService.sendBoardEvent(
                    boardId,
                    BoardEventType.PLANNING_MILESTONE_REINDEXED,
                    null,
                    null,
                    Map.of("updated_count", updatedCount)
            );
        }
    }

    /**
     * 마일스톤 삭제 이후 보드 전체 재계산을 트리거한다.
     *
     * <p>DB FK ON DELETE SET NULL에 의해 해당 마일스톤을 참조하던
     * primary_milestone_id는 이미 null로 처리되지만, 이 메서드는
     * 보드 전체를 재계산하여 갭으로 바뀐 셀들도 올바른 마일스톤으로 갱신한다.
     *
     * @param boardId 재계산할 보드 ID
     */
    @Transactional
    public void recomputeAfterMilestoneDeleted(String boardId) {
        recomputeForBoard(boardId);
    }

    /**
     * 주 시작일(월요일)이 속하는 마일스톤을 결정한다.
     *
     * <p>여러 마일스톤이 해당 주를 포함하더라도 startDate 오름차순 정렬 기준
     * 첫 번째 마일스톤이 반환된다 (기획서 §1 주차 범위 규칙).
     * 갭 주차(어느 마일스톤에도 속하지 않는 주)에는 null을 반환한다.
     *
     * @param weekStart 주 시작일(ISO 8601 월요일)
     * @param milestones startDate 오름차순 정렬된 마일스톤 목록
     * @return 해당 주에 속하는 첫 번째 마일스톤, 없으면 null
     */
    private Milestone calculatePrimaryMilestone(LocalDate weekStart, List<Milestone> milestones) {
        return milestones.stream()
                .filter(m -> m.getStartDate() != null && m.getEndDate() != null)
                .filter(m -> !weekStart.isBefore(m.getStartDate()) && !weekStart.isAfter(m.getEndDate()))
                .findFirst()
                .orElse(null);
    }
}
