package com.kanban.domain.checklist.controller;

import com.kanban.domain.checklist.dto.ChecklistRequest;
import com.kanban.domain.checklist.dto.ChecklistResponse;
import com.kanban.domain.checklist.service.ChecklistService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/tasks/{taskId}/checklist")
@RequiredArgsConstructor
public class ChecklistController {

    private final ChecklistService checklistService;

    @GetMapping
    public ResponseEntity<ChecklistResponse.ListResponse> getChecklist(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal) {
        ChecklistResponse.ListResponse response = checklistService.getChecklist(boardId, taskId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<ChecklistResponse.Detail> createChecklistItem(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ChecklistRequest.Create request) {
        ChecklistResponse.Detail response = checklistService.createChecklistItem(boardId, taskId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{itemId}")
    public ResponseEntity<ChecklistResponse.Detail> updateChecklistItem(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @PathVariable String itemId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ChecklistRequest.Update request) {
        ChecklistResponse.Detail response = checklistService.updateChecklistItem(boardId, taskId, itemId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{itemId}")
    public ResponseEntity<Map<String, String>> deleteChecklistItem(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @PathVariable String itemId,
            @AuthenticationPrincipal UserPrincipal principal) {
        checklistService.deleteChecklistItem(boardId, taskId, itemId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "체크리스트 항목이 삭제되었습니다"));
    }

    @PatchMapping("/{itemId}/toggle")
    public ResponseEntity<ChecklistResponse.Detail> toggleChecklistItem(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @PathVariable String itemId,
            @AuthenticationPrincipal UserPrincipal principal) {
        ChecklistResponse.Detail response = checklistService.toggleChecklistItem(boardId, taskId, itemId, principal.getUserId());
        return ResponseEntity.ok(response);
    }
}
