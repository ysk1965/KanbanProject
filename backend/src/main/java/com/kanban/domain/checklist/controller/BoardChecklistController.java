package com.kanban.domain.checklist.controller;

import com.kanban.domain.checklist.dto.ChecklistResponse;
import com.kanban.domain.checklist.service.ChecklistService;
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
}
