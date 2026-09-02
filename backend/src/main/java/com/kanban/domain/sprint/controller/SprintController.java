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

    /**
     * JIRA 뷰 확인 처리 — 신규 뱃지 기준선(board_members.jira_last_seen_at)을 now로 민다.
     * JIRA 탭을 벗어날 때 프론트가 호출한다. 응답 본문 없음(204).
     */
    @PostMapping("/jira/seen")
    public ResponseEntity<Void> markJiraSeen(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        sprintService.markJiraSeen(boardId, userPrincipal.getUserId());
        return ResponseEntity.noContent().build();
    }

    /** 마일스톤 관리 콘솔 — 마일스톤 전체 태스크(스프린트 무관) Feature ▸ Task 트리 소스 */
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

    /** 태스크 담기 (Sprint 컬럼으로). 그 태스크의 체크리스트는 함께 딸려 들어온다. */
    @PostMapping("/sprints/{sprintId}/tasks")
    public ResponseEntity<SprintResponse.Board> addTask(
            @PathVariable String boardId,
            @PathVariable String sprintId,
            @Valid @RequestBody SprintRequest.AddTask request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                sprintService.addTask(boardId, sprintId, request.getTaskId(), userPrincipal.getUserId()));
    }

    /** 주기 이름·기간 변경 — 레벨 1→2 승급 마법사가 기간을 정할 때 쓴다. */
    @PatchMapping("/sprints/{sprintId}")
    public ResponseEntity<SprintResponse.Board> updateSprint(
            @PathVariable String boardId,
            @PathVariable String sprintId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody SprintRequest.UpdateSprint request) {
        return ResponseEntity.ok(sprintService.updateSprint(
                boardId, sprintId, request.getName(),
                request.getStartDate(), request.getEndDate(), principal.getUserId()));
    }

    /** 태스크 빼기 (백로그로 복귀) */
    @DeleteMapping("/sprints/{sprintId}/tasks/{taskId}")
    public ResponseEntity<SprintResponse.Board> removeTask(
            @PathVariable String boardId,
            @PathVariable String sprintId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                sprintService.removeTask(boardId, sprintId, taskId, userPrincipal.getUserId()));
    }

    /** 카드 컬럼 이동 (드래그) — END 컬럼 도달 = 스프린트 상의 완료 */
    @PatchMapping("/tasks/{taskId}/sprint-column")
    public ResponseEntity<SprintResponse.Board> moveToColumn(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @Valid @RequestBody SprintRequest.MoveColumn request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                sprintService.moveToColumn(boardId, taskId, request.getColumnId(), userPrincipal.getUserId()));
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

    /**
     * 스프린트 분할 생성/조정 — 마일스톤 기간을 count개 버킷으로 나눈다 (관리자).
     * boundaries 생략 시 균등 분배. 종료/이월 라이프사이클의 대체 진입점.
     */
    @PutMapping("/milestones/{milestoneId}/sprint-split")
    public ResponseEntity<SprintResponse.Board> splitSprints(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @Valid @RequestBody SprintRequest.Split request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(sprintService.splitSprints(
                boardId, milestoneId, request.getCount(), request.getBoundaries(),
                request.getTaskDistribution(), userPrincipal.getUserId()));
    }

    /** 지난 스프린트의 미완료 태스크를 다음 스프린트로 일괄 이동 (이월 배지 +1) — 관리자 */
    @PostMapping("/sprints/{sprintId}/push-unfinished")
    public ResponseEntity<SprintResponse.Board> pushUnfinished(
            @PathVariable String boardId,
            @PathVariable String sprintId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                sprintService.pushUnfinished(boardId, sprintId, userPrincipal.getUserId()));
    }

    /** 특정 스프린트에 담긴 태스크 카드 목록 (지난 스프린트 열람용) */
    @GetMapping("/sprints/{sprintId}/tasks")
    public ResponseEntity<List<SprintResponse.ItemCard>> getSprintTasks(
            @PathVariable String boardId,
            @PathVariable String sprintId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(sprintService.getSprintTasks(boardId, sprintId, userPrincipal.getUserId()));
    }
}
