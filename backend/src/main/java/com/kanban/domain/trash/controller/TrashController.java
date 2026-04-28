package com.kanban.domain.trash.controller;

import com.kanban.domain.trash.dto.TrashResponse;
import com.kanban.domain.trash.service.TrashService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/trash")
@RequiredArgsConstructor
public class TrashController {

    private final TrashService trashService;

    @GetMapping
    public ResponseEntity<TrashResponse.ListResponse> listTrash(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(trashService.listTrash(boardId, principal.getUserId()));
    }

    // ==================== Restore ====================

    @PostMapping("/features/{featureId}/restore")
    public ResponseEntity<Void> restoreFeature(
            @PathVariable String boardId,
            @PathVariable String featureId,
            @AuthenticationPrincipal UserPrincipal principal) {
        trashService.restoreFeature(boardId, featureId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/tasks/{taskId}/restore")
    public ResponseEntity<Void> restoreTask(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal) {
        trashService.restoreTask(boardId, taskId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/checklist-items/{itemId}/restore")
    public ResponseEntity<Void> restoreChecklistItem(
            @PathVariable String boardId,
            @PathVariable String itemId,
            @AuthenticationPrincipal UserPrincipal principal) {
        trashService.restoreChecklistItem(boardId, itemId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    // ==================== Permanent Delete ====================

    @DeleteMapping("/features/{featureId}")
    public ResponseEntity<Void> permanentlyDeleteFeature(
            @PathVariable String boardId,
            @PathVariable String featureId,
            @AuthenticationPrincipal UserPrincipal principal) {
        trashService.permanentlyDeleteFeature(boardId, featureId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/tasks/{taskId}")
    public ResponseEntity<Void> permanentlyDeleteTask(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal) {
        trashService.permanentlyDeleteTask(boardId, taskId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/checklist-items/{itemId}")
    public ResponseEntity<Void> permanentlyDeleteChecklistItem(
            @PathVariable String boardId,
            @PathVariable String itemId,
            @AuthenticationPrincipal UserPrincipal principal) {
        trashService.permanentlyDeleteChecklistItem(boardId, itemId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    public ResponseEntity<Void> emptyTrash(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        trashService.emptyTrash(boardId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }
}
