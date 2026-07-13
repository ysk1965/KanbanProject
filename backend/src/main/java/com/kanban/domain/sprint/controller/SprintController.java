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

    /** 카드 단계 이동 (sprint ↔ review ↔ done) */
    @PatchMapping("/checklist-items/{itemId}/sprint-stage")
    public ResponseEntity<SprintResponse.Board> moveStage(
            @PathVariable String boardId,
            @PathVariable String itemId,
            @Valid @RequestBody SprintRequest.MoveStage request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                sprintService.moveStage(boardId, itemId, request.getStage(), userPrincipal.getUserId()));
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
