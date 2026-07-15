package com.kanban.domain.checklist.controller;

import com.kanban.domain.checklist.dto.ChecklistBatchRequest;
import com.kanban.domain.checklist.dto.ChecklistBatchResponse;
import com.kanban.domain.checklist.dto.ChecklistRequest;
import com.kanban.domain.checklist.dto.ChecklistResponse;
import com.kanban.domain.checklist.service.ChecklistService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/checklist-items")
@RequiredArgsConstructor
public class BoardChecklistController {

    private final ChecklistService checklistService;

    @GetMapping
    public ResponseEntity<ChecklistResponse.BoardListResponse> getBoardChecklistItems(
            @PathVariable String boardId,
            @RequestParam(required = false) String assigneeId,
            @RequestParam(required = false) Boolean isScheduled,
            @AuthenticationPrincipal UserPrincipal principal) {
        ChecklistResponse.BoardListResponse response = checklistService.getBoardChecklistItems(
                boardId, principal.getUserId(), assigneeId, isScheduled);
        return ResponseEntity.ok(response);
    }

    /**
     * UC-001: 담당자별 체크리스트 조회 (캘린더/리소스 뷰용)
     * - 권한: Board.Viewer+
     * - startDate, endDate 날짜 범위 필터 (선택, ISO-8601 yyyy-MM-dd)
     * - 응답: assignees(담당자별 그룹) + unassigned(미배정 항목)
     */
    @GetMapping("/by-assignee")
    public ResponseEntity<ChecklistResponse.ByAssigneeResponse> getChecklistItemsByAssignee(
            @PathVariable String boardId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @AuthenticationPrincipal UserPrincipal principal) {
        ChecklistResponse.ByAssigneeResponse response = checklistService.getChecklistItemsByAssignee(
                boardId, principal.getUserId(), startDate, endDate);
        return ResponseEntity.ok(response);
    }

    /**
     * 팀 주간 리포트용: 기간 내(completedAt) 완료된 체크리스트 항목을 담당자·태스크·피처와 함께 조회.
     * - 권한: Board.Viewer+
     * - start_date, end_date 필수 (ISO-8601 yyyy-MM-dd, completedAt 기준 포함 구간)
     */
    @GetMapping("/completed")
    public ResponseEntity<ChecklistResponse.BoardListResponse> getCompletedChecklistItems(
            @PathVariable String boardId,
            @RequestParam("start_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam("end_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @AuthenticationPrincipal UserPrincipal principal) {
        ChecklistResponse.BoardListResponse response = checklistService.getCompletedChecklistItems(
                boardId, principal.getUserId(), startDate, endDate);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/from-workload")
    public ResponseEntity<ChecklistResponse.Detail> createFromWorkload(
            @PathVariable String boardId,
            @Valid @RequestBody ChecklistRequest.CreateFromWorkload request,
            @AuthenticationPrincipal UserPrincipal principal,
            HttpServletRequest httpRequest) {
        String originUrl = httpRequest.getHeader("Origin");
        ChecklistResponse.Detail response = checklistService.createChecklistItemFromWorkload(
                boardId, principal.getUserId(), request, originUrl);
        return ResponseEntity.ok(response);
    }

    /**
     * 여러 Task의 체크리스트를 일괄 조회
     * N+1 문제를 방지하기 위해 IN 쿼리 사용
     */
    @PostMapping("/batch")
    public ResponseEntity<ChecklistBatchResponse> getBatchChecklists(
            @PathVariable String boardId,
            @Valid @RequestBody ChecklistBatchRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        ChecklistBatchResponse response = checklistService.getBatchChecklists(
                boardId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }
}
