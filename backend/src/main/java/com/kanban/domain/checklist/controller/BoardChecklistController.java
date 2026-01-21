package com.kanban.domain.checklist.controller;

import com.kanban.domain.checklist.dto.ChecklistBatchRequest;
import com.kanban.domain.checklist.dto.ChecklistBatchResponse;
import com.kanban.domain.checklist.dto.ChecklistResponse;
import com.kanban.domain.checklist.service.ChecklistService;
import jakarta.validation.Valid;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

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
