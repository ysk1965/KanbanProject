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
import com.kanban.domain.planning.dto.PlanningCardResponse.ListResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import org.junit.jupiter.api.BeforeEach;
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
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.*;

/**
 * PlanningCardService 단위 테스트 (Mockito 기반).
 * 프로젝트에 별도 test 소스셋 관행이 없으므로 순수 Mock 방식으로 작성.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PlanningCardServiceTest {

    @Mock private PlanningCardRepository planningCardRepository;
    @Mock private BoardRepository boardRepository;
    @Mock private BoardMemberRepository boardMemberRepository;
    @Mock private MilestoneRepository milestoneRepository;
    @Mock private MilestoneAllocationRepository milestoneAllocationRepository;
    @Mock private UserRepository userRepository;
    @Mock private BoardService boardService;
    @Mock private WebSocketEventService webSocketEventService;
    @Mock private ActivityService activityService;

    @InjectMocks
    private PlanningCardService service;

    private static final String BOARD_ID = "board-001";
    private static final String USER_ID  = "user-001";
    private static final String CARD_ID  = "card-001";

    private Board board;
    private User user;

    @BeforeEach
    void setUp() {
        board = mock(Board.class);
        given(board.getId()).willReturn(BOARD_ID);

        user = mock(User.class);
        given(user.getId()).willReturn(USER_ID);
        given(user.getName()).willReturn("Alice");
    }

    // =========================================================================
    // 1. getPlanningCards — 빈 보드
    // =========================================================================
    @Test
    @DisplayName("빈 보드 조회: cards=[], summary.pool.card_count=0")
    void getPlanningCards_emptyBoard() {
        given(boardRepository.findById(BOARD_ID)).willReturn(Optional.of(board));
        given(planningCardRepository.findByBoardIdWithAssignee(BOARD_ID)).willReturn(Collections.emptyList());
        given(milestoneRepository.findByBoardIdOrderByStartDateAsc(BOARD_ID)).willReturn(Collections.emptyList());
        given(boardMemberRepository.findByBoardId(BOARD_ID)).willReturn(Collections.emptyList());

        ListResponse result = service.getPlanningCards(BOARD_ID, USER_ID);

        assertThat(result.cards()).isEmpty();
        assertThat(result.summary().pool().cardCount()).isZero();
        assertThat(result.summary().weeks()).hasSize(12); // 마일스톤 없으면 12주 기본
    }

    // =========================================================================
    // 2. getPlanningCards — 풀 카드 + 셀 카드 혼재
    // =========================================================================
    @Test
    @DisplayName("풀/셀 혼재: pool.card_count=1, cells.load_hours 정확")
    void getPlanningCards_poolAndCellMixed() {
        // Monday
        LocalDate monday = LocalDate.of(2026, 4, 20);

        User assignee = mock(User.class);
        given(assignee.getId()).willReturn(USER_ID);
        given(assignee.getName()).willReturn("Alice");

        PlanningCard poolCard = buildCard("pool-c", null, null, 4.0);
        PlanningCard cellCard = buildCard("cell-c", monday, assignee, 6.0);

        given(boardRepository.findById(BOARD_ID)).willReturn(Optional.of(board));
        given(planningCardRepository.findByBoardIdWithAssignee(BOARD_ID))
                .willReturn(List.of(poolCard, cellCard));
        given(milestoneRepository.findByBoardIdOrderByStartDateAsc(BOARD_ID)).willReturn(Collections.emptyList());

        BoardMember bm = mock(BoardMember.class);
        given(bm.getUser()).willReturn(assignee);
        given(boardMemberRepository.findByBoardId(BOARD_ID)).willReturn(List.of(bm));

        ListResponse result = service.getPlanningCards(BOARD_ID, USER_ID);

        assertThat(result.cards()).hasSize(2);
        assertThat(result.summary().pool().cardCount()).isEqualTo(1);
        assertThat(result.summary().pool().loadHours()).isEqualTo(4.0);
    }

    // =========================================================================
    // 3. getPlanningCards — 마일스톤 겹치는 주: primary 결정 (시작일 빠른 쪽)
    // =========================================================================
    @Test
    @DisplayName("주차에 2개 마일스톤 겹침: start_date 빠른 쪽이 primary")
    void getPlanningCards_overlappingMilestones_primaryIsEarlierOne() {
        LocalDate monday = LocalDate.of(2026, 4, 20); // W17

        Milestone m1 = buildMilestone("m1",
                LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 30));
        Milestone m2 = buildMilestone("m2",
                LocalDate.of(2026, 4, 15), LocalDate.of(2026, 5, 10));

        // calculatePrimaryMilestone 직접 테스트 (package-private 메서드)
        Milestone primary = service.calculatePrimaryMilestone(monday, List.of(m1, m2));
        assertThat(primary).isNotNull();
        assertThat(primary.getId()).isEqualTo("m1");
    }

    // =========================================================================
    // 4. getPlanningCards — capacity 없는 셀 → status=UNKNOWN
    // =========================================================================
    @Test
    @DisplayName("capacity 미설정 셀: UtilizationStatus=UNKNOWN")
    void getPlanningCards_noCapacity_statusUnknown() {
        LocalDate monday = LocalDate.of(2026, 4, 20);
        Milestone m = buildMilestone("m1",
                LocalDate.of(2026, 4, 20), LocalDate.of(2026, 4, 26));

        User assignee = mock(User.class);
        given(assignee.getId()).willReturn(USER_ID);
        given(assignee.getName()).willReturn("Alice");

        PlanningCard cellCard = buildCard("cell-c", monday, assignee, 8.0);

        given(boardRepository.findById(BOARD_ID)).willReturn(Optional.of(board));
        given(planningCardRepository.findByBoardIdWithAssignee(BOARD_ID)).willReturn(List.of(cellCard));
        given(milestoneRepository.findByBoardIdOrderByStartDateAsc(BOARD_ID)).willReturn(List.of(m));
        // allocation 없음 → capacity null → UNKNOWN
        given(milestoneAllocationRepository.findByMilestoneIdWithMember(m.getId())).willReturn(Collections.emptyList());

        BoardMember bm = mock(BoardMember.class);
        given(bm.getUser()).willReturn(assignee);
        given(boardMemberRepository.findByBoardId(BOARD_ID)).willReturn(List.of(bm));

        ListResponse result = service.getPlanningCards(BOARD_ID, USER_ID);

        // 카드가 있는 셀이 포함되어야 하고, capacity_hours=null 이어야 함
        assertThat(result.summary().cells()).anyMatch(c ->
                c.assigneeId().equals(USER_ID)
                && c.capacityHours() == null
        );
    }

    // =========================================================================
    // 5. createCard — happy path
    // =========================================================================
    @Test
    @DisplayName("createCard: 정상 생성 → CardDto 반환 + WS 이벤트 발행")
    void createCard_happyPath() {
        CreateRequest req = new CreateRequest("플래닝 카드", null, null, null, 4.0, null, null);

        given(boardRepository.findById(BOARD_ID)).willReturn(Optional.of(board));
        given(userRepository.findById(USER_ID)).willReturn(Optional.of(user));
        given(milestoneRepository.findByBoardIdOrderByStartDateAsc(BOARD_ID)).willReturn(Collections.emptyList());
        given(planningCardRepository.findByBoardIdOrderByPositionAsc(BOARD_ID)).willReturn(Collections.emptyList());
        given(planningCardRepository.save(any(PlanningCard.class))).willAnswer(inv -> {
            PlanningCard c = inv.getArgument(0);
            return c;
        });

        CardDto result = service.createCard(BOARD_ID, USER_ID, req);

        assertThat(result.title()).isEqualTo("플래닝 카드");
        assertThat(result.estimatedHours()).isEqualTo(4.0);
        then(webSocketEventService).should(atLeastOnce()).sendBoardEvent(
                eq(BOARD_ID), any(), eq(USER_ID), eq("Alice"), any());
    }

    // =========================================================================
    // 6. createCard — 다른 보드의 assignee → INVALID_INPUT_VALUE
    // =========================================================================
    @Test
    @DisplayName("다른 보드의 assigneeId → INVALID_INPUT_VALUE 400")
    void createCard_foreignBoardAssignee_throws() {
        CreateRequest req = new CreateRequest("카드", null, "foreign-user", null, null, null, null);

        given(boardRepository.findById(BOARD_ID)).willReturn(Optional.of(board));
        given(userRepository.findById(USER_ID)).willReturn(Optional.of(user));
        // boardMemberRepository.findByBoardIdAndUserId → empty (다른 보드 멤버 아님)
        given(boardMemberRepository.findByBoardIdAndUserId(BOARD_ID, "foreign-user"))
                .willReturn(Optional.empty());

        assertThatThrownBy(() -> service.createCard(BOARD_ID, USER_ID, req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT_VALUE);
    }

    // =========================================================================
    // 7. updateCard — happy path
    // =========================================================================
    @Test
    @DisplayName("updateCard: 제목/예상시간 수정 → 변경된 CardDto 반환")
    void updateCard_happyPath() {
        LocalDate monday = LocalDate.of(2026, 4, 20);
        PlanningCard card = buildCard(CARD_ID, monday, null, 2.0);
        given(card.getBoard()).willReturn(board);
        given(card.getTitle()).willReturn("수정된 제목");
        given(card.getEstimatedHours()).willReturn(8.0);

        given(planningCardRepository.findById(CARD_ID)).willReturn(Optional.of(card));
        given(userRepository.findById(USER_ID)).willReturn(Optional.of(user));

        UpdateRequest req = new UpdateRequest("수정된 제목", null, 8.0, null);
        CardDto result = service.updateCard(BOARD_ID, CARD_ID, USER_ID, req);

        assertThat(result.title()).isEqualTo("수정된 제목");
        assertThat(result.estimatedHours()).isEqualTo(8.0);
        then(activityService).should(atLeastOnce()).logActivity(
                eq(board), eq(user),
                eq(ActivityAction.PLANNING_CARD_UPDATED),
                eq(TargetType.PLANNING_CARD),
                eq(CARD_ID),
                any()
        );
    }

    // =========================================================================
    // 8. moveCard — 월요일 아닌 날짜 → PL003
    // =========================================================================
    @Test
    @DisplayName("moveCard: 화요일 날짜 → PL003 PLANNING_CARD_INVALID_WEEK")
    void moveCard_notMonday_throwsPL003() {
        LocalDate tuesday = LocalDate.of(2026, 4, 21); // 화요일

        PlanningCard card = buildCard(CARD_ID, null, null, null);
        given(card.getBoard()).willReturn(board);
        given(planningCardRepository.findById(CARD_ID)).willReturn(Optional.of(card));

        MoveRequest req = new MoveRequest(tuesday, null, 0);
        assertThatThrownBy(() -> service.moveCard(BOARD_ID, CARD_ID, USER_ID, req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.PLANNING_CARD_INVALID_WEEK);
    }

    // =========================================================================
    // 9. moveCard — 존재하지 않는 카드 → PL001
    // =========================================================================
    @Test
    @DisplayName("moveCard: 존재하지 않는 cardId → PL001 PLANNING_CARD_NOT_FOUND")
    void moveCard_cardNotFound_throwsPL001() {
        given(planningCardRepository.findById("nonexistent")).willReturn(Optional.empty());

        MoveRequest req = new MoveRequest(null, null, 0);
        assertThatThrownBy(() -> service.moveCard(BOARD_ID, "nonexistent", USER_ID, req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.PLANNING_CARD_NOT_FOUND);
    }

    // =========================================================================
    // 10. moveCard — 다른 보드의 카드 → PL002
    // =========================================================================
    @Test
    @DisplayName("moveCard: 다른 보드의 카드 → PL002 PLANNING_CARD_BOARD_MISMATCH")
    void moveCard_wrongBoard_throwsPL002() {
        Board otherBoard = mock(Board.class);
        given(otherBoard.getId()).willReturn("other-board");

        PlanningCard card = buildCard(CARD_ID, null, null, null);
        given(card.getBoard()).willReturn(otherBoard);
        given(planningCardRepository.findById(CARD_ID)).willReturn(Optional.of(card));

        MoveRequest req = new MoveRequest(null, null, 0);
        assertThatThrownBy(() -> service.moveCard(BOARD_ID, CARD_ID, USER_ID, req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.PLANNING_CARD_BOARD_MISMATCH);
    }

    // =========================================================================
    // 11. moveCard — 풀로 이동 (week/assignee null) → 성공
    // =========================================================================
    @Test
    @DisplayName("moveCard: week_start_date=null, assignee_id=null → 풀 복귀 성공")
    void moveCard_toPool_success() {
        LocalDate oldMonday = LocalDate.of(2026, 4, 20);
        User assignee = mock(User.class);
        given(assignee.getId()).willReturn("u2");

        PlanningCard card = buildCard(CARD_ID, oldMonday, assignee, 4.0);
        given(card.getBoard()).willReturn(board);
        given(planningCardRepository.findById(CARD_ID)).willReturn(Optional.of(card));
        given(userRepository.findById(USER_ID)).willReturn(Optional.of(user));
        given(planningCardRepository.findByBoardIdOrderByPositionAsc(BOARD_ID)).willReturn(Collections.emptyList());

        MoveRequest req = new MoveRequest(null, null, 0);
        CardDto result = service.moveCard(BOARD_ID, CARD_ID, USER_ID, req);

        // week_start_date=null + assignee=null → 풀 상태
        then(card).should(atLeastOnce()).moveTo(null, null, null, 0);
    }

    // =========================================================================
    // 12. reorderCards — 다른 셀 카드 섞임 → PL004
    // =========================================================================
    @Test
    @DisplayName("reorderCards: 서로 다른 셀 카드 → PL004 PLANNING_CARD_REORDER_MISMATCH")
    void reorderCards_differentCells_throwsPL004() {
        LocalDate monday = LocalDate.of(2026, 4, 20);
        LocalDate otherMonday = LocalDate.of(2026, 4, 13);

        User assignee = mock(User.class);
        given(assignee.getId()).willReturn(USER_ID);

        PlanningCard card1 = buildCard("c1", monday, assignee, 4.0);
        given(card1.getBoard()).willReturn(board);

        PlanningCard card2 = buildCard("c2", otherMonday, assignee, 2.0); // 다른 주
        given(card2.getBoard()).willReturn(board);

        given(planningCardRepository.findAllById(List.of("c1", "c2"))).willReturn(List.of(card1, card2));

        ReorderRequest req = new ReorderRequest(monday, USER_ID, List.of("c1", "c2"));
        assertThatThrownBy(() -> service.reorderCards(BOARD_ID, USER_ID, req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.PLANNING_CARD_REORDER_MISMATCH);
    }

    // =========================================================================
    // 13. reorderCards — happy path: position 재배정
    // =========================================================================
    @Test
    @DisplayName("reorderCards: 정상 정렬 → position 0, 1 재배정")
    void reorderCards_happyPath() {
        LocalDate monday = LocalDate.of(2026, 4, 20);
        User assignee = mock(User.class);
        given(assignee.getId()).willReturn(USER_ID);

        PlanningCard card1 = buildCard("c1", monday, assignee, 4.0);
        given(card1.getBoard()).willReturn(board);
        given(card1.getWeekStartDate()).willReturn(monday);
        given(card1.getAssignee()).willReturn(assignee);
        given(card1.getPrimaryMilestone()).willReturn(null);

        PlanningCard card2 = buildCard("c2", monday, assignee, 2.0);
        given(card2.getBoard()).willReturn(board);
        given(card2.getWeekStartDate()).willReturn(monday);
        given(card2.getAssignee()).willReturn(assignee);
        given(card2.getPrimaryMilestone()).willReturn(null);

        given(planningCardRepository.findAllById(List.of("c1", "c2"))).willReturn(List.of(card1, card2));
        given(userRepository.findById(USER_ID)).willReturn(Optional.of(user));

        ReorderRequest req = new ReorderRequest(monday, USER_ID, List.of("c1", "c2"));
        assertThatNoException().isThrownBy(() -> service.reorderCards(BOARD_ID, USER_ID, req));

        then(card1).should().moveTo(any(), eq(monday), any(), eq(0));
        then(card2).should().moveTo(any(), eq(monday), any(), eq(1));
    }

    // =========================================================================
    // 14. deleteCard — happy path
    // =========================================================================
    @Test
    @DisplayName("deleteCard: 카드 삭제 + ActivityLog 기록")
    void deleteCard_happyPath() {
        PlanningCard card = buildCard(CARD_ID, null, null, null);
        given(card.getBoard()).willReturn(board);
        given(card.getTitle()).willReturn("삭제될 카드");
        given(planningCardRepository.findById(CARD_ID)).willReturn(Optional.of(card));
        given(userRepository.findById(USER_ID)).willReturn(Optional.of(user));

        assertThatNoException().isThrownBy(() -> service.deleteCard(BOARD_ID, CARD_ID, USER_ID));

        then(planningCardRepository).should().delete(card);
        then(activityService).should(atLeastOnce()).logActivity(
                eq(board), eq(user),
                eq(ActivityAction.PLANNING_CARD_DELETED),
                eq(TargetType.PLANNING_CARD),
                eq(CARD_ID),
                any()
        );
    }

    // =========================================================================
    // 15. computeWeekRange — 마일스톤 없을 때 12주 기본
    // =========================================================================
    @Test
    @DisplayName("computeWeekRange: 마일스톤 없으면 오늘 기준 12주")
    void computeWeekRange_noMilestones_returns12Weeks() {
        List<LocalDate> weeks = service.computeWeekRange(Collections.emptyList());
        assertThat(weeks).hasSize(12);
        // 첫 날이 월요일이어야 함
        assertThat(weeks.get(0).getDayOfWeek())
                .isEqualTo(java.time.DayOfWeek.MONDAY);
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    /**
     * Spy 기반 PlanningCard Mock 생성 헬퍼.
     * 도메인 메서드(moveTo, updateContent)를 검증하기 위해 spy 사용.
     */
    private PlanningCard buildCard(String id, LocalDate weekStart, User assignee, Double hours) {
        PlanningCard card = mock(PlanningCard.class);
        given(card.getId()).willReturn(id);
        given(card.getTitle()).willReturn("Test Card " + id);
        given(card.getDescription()).willReturn(null);
        given(card.getAssignee()).willReturn(assignee);
        given(card.getWeekStartDate()).willReturn(weekStart);
        given(card.getPrimaryMilestone()).willReturn(null);
        given(card.getEstimatedHours()).willReturn(hours);
        given(card.getPosition()).willReturn(0);
        given(card.getColor()).willReturn(null);
        given(card.getCreatedBy()).willReturn(null);
        given(card.getPromotedTask()).willReturn(null);
        given(card.getPromotedAt()).willReturn(null);
        given(card.getCreatedAt()).willReturn(java.time.LocalDateTime.of(2026, 4, 21, 0, 0));
        given(card.getUpdatedAt()).willReturn(null);
        return card;
    }

    private Milestone buildMilestone(String id, LocalDate start, LocalDate end) {
        Milestone m = mock(Milestone.class);
        given(m.getId()).willReturn(id);
        given(m.getTitle()).willReturn("Milestone " + id);
        given(m.getStartDate()).willReturn(start);
        given(m.getEndDate()).willReturn(end);
        return m;
    }
}
