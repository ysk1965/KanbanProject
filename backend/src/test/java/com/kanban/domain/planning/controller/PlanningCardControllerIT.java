package com.kanban.domain.planning.controller;

import com.kanban.domain.monitoring.service.MonitoringAlertService;
import com.kanban.domain.planning.dto.PlanningCardResponse.CardDto;
import com.kanban.domain.planning.dto.PlanningCardResponse.ListResponse;
import com.kanban.domain.planning.dto.PlanningCardResponse.PoolSummary;
import com.kanban.domain.planning.dto.PlanningCardResponse.SummaryDto;
import com.kanban.domain.planning.service.PlanningCardService;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * PlanningCardController MockMvc 테스트.
 * <p>
 * 테스트용 SecurityConfig를 주입하여 인증 처리를 단순화.
 * 권한 제어는 Service 레이어 예외 시뮬레이션으로 검증.
 * <p>
 * 검증 항목:
 * <ul>
 *   <li>응답 JSON이 snake_case 필드명 사용 (Jackson SNAKE_CASE 전략)</li>
 *   <li>각 엔드포인트 상태 코드 (200/201/204/400/403/404)</li>
 *   <li>PL001~PL004 에러코드 응답 확인</li>
 *   <li>@Valid 검증 동작 (@NotBlank → 400)</li>
 * </ul>
 */
@WebMvcTest(
    controllers = PlanningCardController.class,
    excludeFilters = {
        @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
            com.kanban.global.security.JwtAuthenticationFilter.class,
            com.kanban.global.security.RateLimitingFilter.class,
            com.kanban.global.filter.ActivityTrackingFilter.class,
            com.kanban.global.filter.MaintenanceFilter.class,
            com.kanban.global.config.SecurityConfig.class
        })
    }
)
@Import(PlanningTestSecurityConfig.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PlanningCardControllerIT {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private PlanningCardService planningCardService;

    // GlobalExceptionHandler 의존성
    @MockBean
    private MonitoringAlertService monitoringAlertService;

    @MockBean
    private UserRepository userRepository;

    private static final String BOARD_ID = "board-001";
    private static final String CARD_ID  = "card-001";
    private static final String USER_ID  = PlanningTestSecurityConfig.TEST_USER_ID;

    // =========================================================================
    // Helper
    // =========================================================================
    private CardDto sampleCard() {
        return new CardDto(
                CARD_ID, "Test Card", null, null,
                LocalDate.of(2026, 4, 20), "milestone-1",
                4.0, 0, null, null,
                LocalDateTime.of(2026, 4, 21, 0, 0),
                null, null, null
        );
    }

    private ListResponse emptyListResponse() {
        SummaryDto summary = new SummaryDto(
                Collections.emptyList(), Collections.emptyList(), Collections.emptyList(),
                Collections.emptyList(), Collections.emptyList(), Collections.emptyList(),
                PoolSummary.of(0, 0.0)
        );
        return new ListResponse(Collections.emptyList(), summary);
    }

    // =========================================================================
    // T1. GET /planning-cards — 성공 200
    // =========================================================================
    @Test
    @DisplayName("GET /planning-cards: 인증 사용자 200 반환")
    void getList_authenticated_returns200() throws Exception {
        given(planningCardService.getPlanningCards(any(), any()))
                .willReturn(emptyListResponse());

        mockMvc.perform(get("/api/v1/boards/{boardId}/planning-cards", BOARD_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cards").isArray())
                .andExpect(jsonPath("$.summary").exists());
    }

    // =========================================================================
    // T2. GET /planning-cards — snake_case 응답 필드 검증
    // =========================================================================
    @Test
    @DisplayName("GET /planning-cards: 응답 JSON이 snake_case 필드명 사용")
    void getList_responseHasSnakeCaseFields() throws Exception {
        CardDto card = sampleCard();
        SummaryDto summary = new SummaryDto(
                Collections.emptyList(), Collections.emptyList(), Collections.emptyList(),
                Collections.emptyList(), Collections.emptyList(), Collections.emptyList(),
                PoolSummary.of(0, 0.0)
        );
        ListResponse listResponse = new ListResponse(List.of(card), summary);
        given(planningCardService.getPlanningCards(any(), any())).willReturn(listResponse);

        mockMvc.perform(get("/api/v1/boards/{boardId}/planning-cards", BOARD_ID))
                .andExpect(status().isOk())
                // snake_case 필드명 검증 (Jackson SNAKE_CASE 전략: camelCase → snake_case)
                .andExpect(jsonPath("$.cards[0].week_start_date").value("2026-04-20"))
                .andExpect(jsonPath("$.cards[0].primary_milestone_id").value("milestone-1"))
                .andExpect(jsonPath("$.cards[0].estimated_hours").value(4.0))
                .andExpect(jsonPath("$.summary.pool.card_count").value(0))
                .andExpect(jsonPath("$.summary.pool.load_hours").value(0.0));
    }

    // =========================================================================
    // T3. POST /planning-cards — 생성 성공 201
    // =========================================================================
    @Test
    @DisplayName("POST /planning-cards: Member 권한 → 201 Created")
    void createCard_member_returns201() throws Exception {
        given(planningCardService.createCard(any(), any(), any()))
                .willReturn(sampleCard());

        String body = "{\"title\":\"New Planning Card\",\"estimated_hours\":4.0}";

        mockMvc.perform(post("/api/v1/boards/{boardId}/planning-cards", BOARD_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(CARD_ID));
    }

    // =========================================================================
    // T4. POST /planning-cards — 빈 제목 → 400
    // =========================================================================
    @Test
    @DisplayName("POST /planning-cards: 빈 title → 400 Bad Request")
    void createCard_blankTitle_returns400() throws Exception {
        String body = "{\"title\":\"\",\"estimated_hours\":4.0}";

        mockMvc.perform(post("/api/v1/boards/{boardId}/planning-cards", BOARD_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());
    }

    // =========================================================================
    // T5. PUT /{cardId} — 수정 성공 200
    // =========================================================================
    @Test
    @DisplayName("PUT /{cardId}: 정상 수정 → 200 OK")
    void updateCard_returns200() throws Exception {
        given(planningCardService.updateCard(any(), any(), any(), any()))
                .willReturn(sampleCard());

        String body = "{\"title\":\"Updated\",\"estimated_hours\":6.0}";

        mockMvc.perform(put("/api/v1/boards/{boardId}/planning-cards/{cardId}", BOARD_ID, CARD_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(CARD_ID));
    }

    // =========================================================================
    // T6. PATCH /{cardId}/move — 이동 성공 200
    // =========================================================================
    @Test
    @DisplayName("PATCH /{cardId}/move: 이동 성공 → 200 OK")
    void moveCard_returns200() throws Exception {
        given(planningCardService.moveCard(any(), any(), any(), any()))
                .willReturn(sampleCard());

        // snake_case 요청 필드
        String body = "{\"week_start_date\":\"2026-04-20\",\"assignee_id\":null,\"position\":0}";

        mockMvc.perform(patch("/api/v1/boards/{boardId}/planning-cards/{cardId}/move", BOARD_ID, CARD_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    // =========================================================================
    // T7. PATCH /{cardId}/move — Service PL003 예외 → 400
    // =========================================================================
    @Test
    @DisplayName("PATCH /{cardId}/move: Service PL003 예외 → 400")
    void moveCard_pl003_returns400() throws Exception {
        given(planningCardService.moveCard(any(), any(), any(), any()))
                .willThrow(new BusinessException(ErrorCode.PLANNING_CARD_INVALID_WEEK));

        String body = "{\"week_start_date\":\"2026-04-21\",\"assignee_id\":null,\"position\":0}";

        mockMvc.perform(patch("/api/v1/boards/{boardId}/planning-cards/{cardId}/move", BOARD_ID, CARD_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PL003"));
    }

    // =========================================================================
    // T8. DELETE /{cardId} — 삭제 성공 204
    // =========================================================================
    @Test
    @DisplayName("DELETE /{cardId}: 삭제 성공 → 204 No Content")
    void deleteCard_returns204() throws Exception {
        willDoNothing().given(planningCardService).deleteCard(any(), any(), any());

        mockMvc.perform(delete("/api/v1/boards/{boardId}/planning-cards/{cardId}", BOARD_ID, CARD_ID))
                .andExpect(status().isNoContent());
    }

    // =========================================================================
    // T9. DELETE — 존재하지 않는 카드 → PL001 404
    // =========================================================================
    @Test
    @DisplayName("DELETE /{cardId}: 존재하지 않는 카드 → PL001 404")
    void deleteCard_notFound_returns404() throws Exception {
        willThrow(new BusinessException(ErrorCode.PLANNING_CARD_NOT_FOUND))
                .given(planningCardService).deleteCard(any(), any(), any());

        mockMvc.perform(delete("/api/v1/boards/{boardId}/planning-cards/{cardId}", BOARD_ID, CARD_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PL001"));
    }

    // =========================================================================
    // T10. PUT /reorder — reorder 성공 204
    // =========================================================================
    @Test
    @DisplayName("PUT /reorder: 정렬 성공 → 204 No Content")
    void reorderCards_returns204() throws Exception {
        willDoNothing().given(planningCardService).reorderCards(any(), any(), any());

        String body = "{\"week_start_date\":\"2026-04-20\",\"assignee_id\":\"u1\",\"card_ids\":[\"c1\",\"c2\"]}";

        mockMvc.perform(put("/api/v1/boards/{boardId}/planning-cards/reorder", BOARD_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNoContent());
    }

    // =========================================================================
    // T11. Viewer 권한 → checkMemberOrAbove에서 BOARD_ACCESS_DENIED → 403
    // =========================================================================
    @Test
    @DisplayName("POST /planning-cards: checkMemberOrAbove 실패 시(Viewer) → 403")
    void createCard_viewerForbidden_returns403() throws Exception {
        given(planningCardService.createCard(any(), any(), any()))
                .willThrow(new BusinessException(ErrorCode.BOARD_ACCESS_DENIED));

        String body = "{\"title\":\"Card\",\"estimated_hours\":2.0}";

        mockMvc.perform(post("/api/v1/boards/{boardId}/planning-cards", BOARD_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
    }

    // =========================================================================
    // T12. PL002 — 다른 보드 카드 404
    // =========================================================================
    @Test
    @DisplayName("PUT /{cardId}: 다른 보드 카드 → PL002 404")
    void updateCard_boardMismatch_returns404() throws Exception {
        given(planningCardService.updateCard(any(), any(), any(), any()))
                .willThrow(new BusinessException(ErrorCode.PLANNING_CARD_BOARD_MISMATCH));

        String body = "{\"title\":\"Updated\"}";

        mockMvc.perform(put("/api/v1/boards/{boardId}/planning-cards/{cardId}", BOARD_ID, CARD_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PL002"));
    }
}
