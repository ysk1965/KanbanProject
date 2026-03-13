package com.kanban.domain.checklist.controller;

import com.kanban.domain.checklist.dto.ChecklistAIRequest;
import com.kanban.domain.checklist.dto.ChecklistAIResponse;
import com.kanban.domain.checklist.dto.ChecklistRequest;
import com.kanban.domain.checklist.dto.ChecklistResponse;
import com.kanban.domain.checklist.service.ChecklistAIService;
import com.kanban.domain.checklist.service.ChecklistService;
import com.kanban.domain.integration.FrontendOriginResolver;
import com.kanban.global.security.UserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
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
    private final ChecklistAIService checklistAIService;

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
            @Valid @RequestBody ChecklistRequest.Create request,
            @RequestHeader(value = "Origin", required = false) String origin,
            HttpServletRequest httpRequest) {
        String resolvedOrigin = FrontendOriginResolver.resolveFrontendUrl(
                origin, httpRequest.getHeader("X-Forwarded-Host"), null);
        ChecklistResponse.Detail response = checklistService.createChecklistItem(boardId, taskId, principal.getUserId(), request, resolvedOrigin);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{itemId}")
    public ResponseEntity<ChecklistResponse.Detail> updateChecklistItem(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @PathVariable String itemId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ChecklistRequest.Update request,
            @RequestHeader(value = "Origin", required = false) String origin,
            HttpServletRequest httpRequest) {
        String resolvedOrigin = FrontendOriginResolver.resolveFrontendUrl(
                origin, httpRequest.getHeader("X-Forwarded-Host"), null);
        ChecklistResponse.Detail response = checklistService.updateChecklistItem(boardId, taskId, itemId, principal.getUserId(), request, resolvedOrigin);
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

    @PutMapping("/{itemId}/move-task")
    public ResponseEntity<ChecklistResponse.Detail> moveChecklistItemToTask(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @PathVariable String itemId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ChecklistRequest.MoveTask request) {
        ChecklistResponse.Detail response = checklistService.moveChecklistItemToTask(boardId, taskId, itemId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/reorder")
    public ResponseEntity<Map<String, String>> reorderChecklistItems(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ChecklistRequest.Reorder request) {
        checklistService.reorderChecklistItems(boardId, taskId, principal.getUserId(), request);
        return ResponseEntity.ok(Map.of("message", "체크리스트 순서가 변경되었습니다"));
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

    @PostMapping("/ai/decompose")
    public ResponseEntity<ChecklistAIResponse.ChecklistDecomposition> aiDecompose(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @RequestParam(required = false) String language,
            @AuthenticationPrincipal UserPrincipal principal) {
        ChecklistAIResponse.ChecklistDecomposition response = checklistAIService.generateChecklistSuggestions(
                boardId, taskId, principal.getUserId(), language);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/ai/apply")
    public ResponseEntity<ChecklistAIResponse.ApplyResult> aiApply(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ChecklistAIRequest.ApplyChecklist request) {
        ChecklistAIResponse.ApplyResult response = checklistAIService.applyChecklistSuggestions(
                boardId, taskId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }
}
