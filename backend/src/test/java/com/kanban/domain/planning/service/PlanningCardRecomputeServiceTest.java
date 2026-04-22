package com.kanban.domain.planning.service;

import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.planning.PlanningCard;
import com.kanban.domain.planning.PlanningCardRepository;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.*;

/**
 * PlanningCardRecomputeService 단위 테스트.
 * 마일스톤 기간 변경/삭제 시 primary_milestone_id 재계산 로직을 검증한다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PlanningCardRecomputeServiceTest {

    @Mock private PlanningCardRepository planningCardRepository;
    @Mock private MilestoneRepository milestoneRepository;
    @Mock private WebSocketEventService webSocketEventService;

    @InjectMocks
    private PlanningCardRecomputeService service;

    private static final String BOARD_ID = "board-001";

    // =========================================================================
    // 1. 마일스톤 기간 변경 후 primary_milestone_id 재계산
    // =========================================================================
    @Test
    @DisplayName("마일스톤 기간 변경: 영향 카드의 primary_milestone_id 재계산 + WS 이벤트 발행")
    void recomputeForBoard_milestoneUpdated_reindexesAffectedCards() {
        LocalDate monday = LocalDate.of(2026, 4, 20); // W17, 월요일

        // 새 마일스톤 (기간 변경됨)
        Milestone newMilestone = buildMilestone("m-new",
                LocalDate.of(2026, 4, 20), LocalDate.of(2026, 4, 30));

        // 기존 마일스톤과 다른 값을 갖고 있는 카드
        Milestone oldMilestone = buildMilestone("m-old",
                LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 31)); // 기간 지남

        PlanningCard card = mock(PlanningCard.class);
        given(card.getWeekStartDate()).willReturn(monday);
        given(card.getPrimaryMilestone()).willReturn(oldMilestone); // 기존 참조

        given(planningCardRepository.findByBoardIdOrderByPositionAsc(BOARD_ID)).willReturn(List.of(card));
        given(milestoneRepository.findByBoardIdOrderByStartDateAsc(BOARD_ID)).willReturn(List.of(newMilestone));

        service.recomputeForBoard(BOARD_ID);

        // 재계산 결과: newMilestone으로 reindex 되어야 함
        then(card).should().reindexPrimaryMilestone(newMilestone);

        // WS 이벤트 발행 확인
        then(webSocketEventService).should(atLeastOnce()).sendBoardEvent(
                eq(BOARD_ID),
                eq(BoardEventType.PLANNING_MILESTONE_REINDEXED),
                isNull(),
                isNull(),
                any()
        );
    }

    // =========================================================================
    // 2. 마일스톤 삭제 후 SET NULL: 재계산에서 null 처리
    // =========================================================================
    @Test
    @DisplayName("마일스톤 삭제: 영향 카드의 primary_milestone_id → null로 재계산")
    void recomputeAfterMilestoneDeleted_setsNullOnAffectedCards() {
        LocalDate monday = LocalDate.of(2026, 4, 20);

        Milestone existingMilestone = buildMilestone("m1",
                LocalDate.of(2026, 4, 20), LocalDate.of(2026, 4, 26));

        // 카드가 이전에 m1을 가리키고 있었지만, 삭제 후 재계산 시 m1 없음
        PlanningCard card = mock(PlanningCard.class);
        given(card.getWeekStartDate()).willReturn(monday);
        given(card.getPrimaryMilestone()).willReturn(existingMilestone); // 기존 참조

        given(planningCardRepository.findByBoardIdOrderByPositionAsc(BOARD_ID)).willReturn(List.of(card));
        // 마일스톤 삭제됨 → 마일스톤 목록 비어있음
        given(milestoneRepository.findByBoardIdOrderByStartDateAsc(BOARD_ID)).willReturn(Collections.emptyList());

        service.recomputeAfterMilestoneDeleted(BOARD_ID);

        // null로 재인덱스
        then(card).should().reindexPrimaryMilestone(null);

        // WS 이벤트 발행
        then(webSocketEventService).should(atLeastOnce()).sendBoardEvent(
                eq(BOARD_ID),
                eq(BoardEventType.PLANNING_MILESTONE_REINDEXED),
                any(),
                any(),
                any()
        );
    }

    // =========================================================================
    // 3. 풀 카드(week_start_date=null)는 재계산 대상 제외
    // =========================================================================
    @Test
    @DisplayName("풀 카드(week_start_date=null): 재계산 건너뜀 + WS 이벤트 미발행")
    void recomputeForBoard_poolCards_skipped() {
        PlanningCard poolCard = mock(PlanningCard.class);
        given(poolCard.getWeekStartDate()).willReturn(null); // 풀 상태

        given(planningCardRepository.findByBoardIdOrderByPositionAsc(BOARD_ID)).willReturn(List.of(poolCard));

        service.recomputeForBoard(BOARD_ID);

        // reindexPrimaryMilestone 호출되지 않아야 함
        then(poolCard).should(never()).reindexPrimaryMilestone(any());
        // 변경 없음 → WS 이벤트 미발행
        then(webSocketEventService).should(never()).sendBoardEvent(any(), any(), any(), any(), any());
    }

    // =========================================================================
    // 4. 빈 보드: 재계산 없이 조기 종료
    // =========================================================================
    @Test
    @DisplayName("보드에 카드 없음: Repository 조회 후 조기 종료 + WS 이벤트 미발행")
    void recomputeForBoard_noCards_earlyReturn() {
        given(planningCardRepository.findByBoardIdOrderByPositionAsc(BOARD_ID)).willReturn(Collections.emptyList());

        service.recomputeForBoard(BOARD_ID);

        then(milestoneRepository).should(never()).findByBoardIdOrderByStartDateAsc(any());
        then(webSocketEventService).should(never()).sendBoardEvent(any(), any(), any(), any(), any());
    }

    // =========================================================================
    // Helper
    // =========================================================================
    private Milestone buildMilestone(String id, LocalDate start, LocalDate end) {
        Milestone m = mock(Milestone.class);
        given(m.getId()).willReturn(id);
        given(m.getStartDate()).willReturn(start);
        given(m.getEndDate()).willReturn(end);
        return m;
    }
}
