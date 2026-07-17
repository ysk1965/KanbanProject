package com.kanban.domain.sprint.controller;

import com.kanban.domain.sprint.dto.SprintRequest;
import com.kanban.domain.sprint.dto.SprintResponse;
import com.kanban.domain.sprint.service.SprintService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/boards/{boardId}")
@RequiredArgsConstructor
public class SprintController {

    private final SprintService sprintService;

    /** 스프린트 프레임 조회 (타임라인 + 컬럼 + 게이지 + 백로그) */
    @GetMapping("/milestones/{milestoneId}/sprint-board")
    public ResponseEntity<SprintResponse.Board> getSprintBoard(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(sprintService.getSprintBoard(boardId, milestoneId, userPrincipal.getUserId()));
    }

    /** 마일스톤 관리 콘솔 — 마일스톤 전체 체크리스트(스프린트 무관) Feature ▸ Task ▸ 체크리스트 소스 */
    @GetMapping("/milestones/{milestoneId}/console")
    public ResponseEntity<List<SprintResponse.ItemCard>> getMilestoneConsole(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                sprintService.getMilestoneConsole(boardId, milestoneId, userPrincipal.getUserId()));
    }

    /** 스프린트 모드 on/off (관리자) — off 시 담긴 카드 병합 */
    @PatchMapping("/milestones/{milestoneId}/sprint-mode")
    public ResponseEntity<SprintResponse.Board> toggleSprintMode(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @Valid @RequestBody SprintRequest.ToggleMode request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                sprintService.toggleSprintMode(boardId, milestoneId, request.getEnabled(), userPrincipal.getUserId()));
    }

    /** 체크리스트 항목 담기 (Sprint 컬럼으로) */
    @PostMapping("/sprints/{sprintId}/items")
    public ResponseEntity<SprintResponse.Board> addItem(
            @PathVariable String boardId,
            @PathVariable String sprintId,
            @Valid @RequestBody SprintRequest.AddItem request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                sprintService.addItem(boardId, sprintId, request.getChecklistItemId(), userPrincipal.getUserId()));
    }

    /** 항목 빼기 (Task 백로그로 복귀) */
    @DeleteMapping("/sprints/{sprintId}/items/{itemId}")
    public ResponseEntity<SprintResponse.Board> removeItem(
            @PathVariable String boardId,
            @PathVariable String sprintId,
            @PathVariable String itemId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                sprintService.removeItem(boardId, sprintId, itemId, userPrincipal.getUserId()));
    }

    /** 카드 컬럼 이동 (드래그) — END 컬럼 도달 시 완료 동기화 */
    @PatchMapping("/checklist-items/{itemId}/sprint-column")
    public ResponseEntity<SprintResponse.Board> moveToColumn(
            @PathVariable String boardId,
            @PathVariable String itemId,
            @Valid @RequestBody SprintRequest.MoveColumn request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                sprintService.moveToColumn(boardId, itemId, request.getColumnId(), userPrincipal.getUserId()));
    }

    // ==================== 컬럼 CRUD (관리자) ====================

    /** 중간 컬럼 추가 */
    @PostMapping("/milestones/{milestoneId}/sprint-columns")
    public ResponseEntity<SprintResponse.Board> createColumn(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @Valid @RequestBody SprintRequest.CreateColumn request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(sprintService.createColumn(
                boardId, milestoneId, request.getName(), request.getColor(), userPrincipal.getUserId()));
    }

    /** 컬럼 이름/색 변경 */
    @PatchMapping("/sprint-columns/{columnId}")
    public ResponseEntity<SprintResponse.Board> updateColumn(
            @PathVariable String boardId,
            @PathVariable String columnId,
            @Valid @RequestBody SprintRequest.UpdateColumn request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(sprintService.updateColumn(
                boardId, columnId, request.getName(), request.getColor(), userPrincipal.getUserId()));
    }

    /** 중간 컬럼 삭제 (담긴 카드는 앞 컬럼으로 이동) */
    @DeleteMapping("/sprint-columns/{columnId}")
    public ResponseEntity<SprintResponse.Board> deleteColumn(
            @PathVariable String boardId,
            @PathVariable String columnId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(sprintService.deleteColumn(boardId, columnId, userPrincipal.getUserId()));
    }

    /** 중간 컬럼 순서 재정렬 */
    @PatchMapping("/milestones/{milestoneId}/sprint-columns/order")
    public ResponseEntity<SprintResponse.Board> reorderColumns(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @Valid @RequestBody SprintRequest.ReorderColumns request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(sprintService.reorderColumns(
                boardId, milestoneId, request.getColumnIds(), userPrincipal.getUserId()));
    }

    /** 스프린트 종료 (100% 완료 시 동결 + 다음 스프린트 생성/복귀) — 관리자 */
    @PostMapping("/sprints/{sprintId}/close")
    public ResponseEntity<SprintResponse.Board> closeSprint(
            @PathVariable String boardId,
            @PathVariable String sprintId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(sprintService.closeSprint(boardId, sprintId, userPrincipal.getUserId()));
    }

    /** 아카이브 스프린트 재활성화 (수정 → 재동결용) — 관리자 */
    @PostMapping("/sprints/{sprintId}/reactivate")
    public ResponseEntity<SprintResponse.Board> reactivateSprint(
            @PathVariable String boardId,
            @PathVariable String sprintId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(sprintService.reactivateSprint(boardId, sprintId, userPrincipal.getUserId()));
    }

    /** 재활성화 취소 (원래 동결 기록 복원) — 관리자 */
    @PostMapping("/sprints/{sprintId}/cancel-reactivation")
    public ResponseEntity<SprintResponse.Board> cancelReactivation(
            @PathVariable String boardId,
            @PathVariable String sprintId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(sprintService.cancelReactivation(boardId, sprintId, userPrincipal.getUserId()));
    }

    /** 특정 스프린트의 담긴 카드 목록 (아카이브 열람용) */
    @GetMapping("/sprints/{sprintId}/items")
    public ResponseEntity<List<SprintResponse.ItemCard>> getSprintItems(
            @PathVariable String boardId,
            @PathVariable String sprintId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(sprintService.getSprintItems(boardId, sprintId, userPrincipal.getUserId()));
    }

    /** 아카이브 항목을 현재 스프린트로 재개 */
    @PostMapping("/checklist-items/{itemId}/resume")
    public ResponseEntity<SprintResponse.Board> resumeItem(
            @PathVariable String boardId,
            @PathVariable String itemId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(sprintService.resumeItem(boardId, itemId, userPrincipal.getUserId()));
    }
}
