package com.kanban.domain.planning.controller;

import com.kanban.domain.planning.dto.PlanningCardRequest.CreateRequest;
import com.kanban.domain.planning.dto.PlanningCardRequest.MoveRequest;
import com.kanban.domain.planning.dto.PlanningCardRequest.ReorderRequest;
import com.kanban.domain.planning.dto.PlanningCardRequest.UpdateRequest;
import com.kanban.domain.planning.dto.PlanningCardResponse.CardDto;
import com.kanban.domain.planning.dto.PlanningCardResponse.ListResponse;
import com.kanban.domain.planning.service.PlanningCardService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * Planning Card REST 컨트롤러.
 * <p>
 * 권한:
 * <ul>
 *   <li>GET — Viewer+</li>
 *   <li>POST / PUT / PATCH / DELETE — Member+</li>
 * </ul>
 * 권한 검증은 {@link PlanningCardService} 내부의
 * {@code boardService.checkViewerOrAbove} / {@code boardService.checkMemberOrAbove} 가 담당.
 */
@RestController
@RequestMapping("/api/v1/boards/{boardId}/planning-cards")
@RequiredArgsConstructor
public class PlanningCardController {

    private final PlanningCardService planningCardService;

    /**
     * 보드의 모든 플래닝 카드 + 주차별 집계(summary) 반환.
     * 권한: Viewer+
     */
    @GetMapping
    public ResponseEntity<ListResponse> list(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                planningCardService.getPlanningCards(boardId, userPrincipal.getUserId())
        );
    }

    /**
     * 플래닝 카드 생성.
     * weekStartDate / assigneeId 모두 null 이면 풀(Pool) 생성.
     * 권한: Member+
     */
    @PostMapping
    public ResponseEntity<CardDto> create(
            @PathVariable String boardId,
            @Valid @RequestBody CreateRequest request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(planningCardService.createCard(boardId, userPrincipal.getUserId(), request));
    }

    /**
     * 플래닝 카드 내용 수정 (제목, 설명, 예상시간, 색상).
     * 배치 정보(assignee, week_start_date) 변경은 PATCH /move 사용.
     * 권한: Member+
     */
    @PutMapping("/{cardId}")
    public ResponseEntity<CardDto> update(
            @PathVariable String boardId,
            @PathVariable String cardId,
            @Valid @RequestBody UpdateRequest request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                planningCardService.updateCard(boardId, cardId, userPrincipal.getUserId(), request)
        );
    }

    /**
     * 플래닝 카드 이동 — 셀 변경 또는 풀 복귀.
     * weekStartDate / assigneeId 모두 null 이면 풀로 복귀.
     * 서버가 primary_milestone_id 를 자동 계산.
     * 권한: Member+
     */
    @PatchMapping("/{cardId}/move")
    public ResponseEntity<CardDto> move(
            @PathVariable String boardId,
            @PathVariable String cardId,
            @Valid @RequestBody MoveRequest request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                planningCardService.moveCard(boardId, cardId, userPrincipal.getUserId(), request)
        );
    }

    /**
     * 플래닝 카드 삭제.
     * 권한: Member+
     */
    @DeleteMapping("/{cardId}")
    public ResponseEntity<Void> delete(
            @PathVariable String boardId,
            @PathVariable String cardId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        planningCardService.deleteCard(boardId, cardId, userPrincipal.getUserId());
        return ResponseEntity.noContent().build();
    }

    /**
     * 동일 셀(또는 풀) 내 카드 순서 재정렬.
     * card_ids 배열 순서대로 position 을 0-based 로 재설정.
     * 권한: Member+
     */
    @PutMapping("/reorder")
    public ResponseEntity<Void> reorder(
            @PathVariable String boardId,
            @Valid @RequestBody ReorderRequest request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        planningCardService.reorderCards(boardId, userPrincipal.getUserId(), request);
        return ResponseEntity.noContent().build();
    }
}
