package com.kanban.domain.personal.controller;

import com.kanban.domain.personal.dto.PersonalTaskRequest;
import com.kanban.domain.personal.dto.PersonalTaskResponse;
import com.kanban.domain.personal.service.PersonalTaskService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/personal/tasks")
@RequiredArgsConstructor
public class PersonalTaskController {

    private final PersonalTaskService personalTaskService;

    @GetMapping
    public ResponseEntity<List<PersonalTaskResponse.Detail>> getTasks(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(personalTaskService.getTasks(principal.getUserId()));
    }

    @GetMapping("/{taskId}")
    public ResponseEntity<PersonalTaskResponse.Detail> getTask(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String taskId) {
        return ResponseEntity.ok(personalTaskService.getTask(principal.getUserId(), taskId));
    }

    @PostMapping
    public ResponseEntity<PersonalTaskResponse.Detail> createTask(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody PersonalTaskRequest.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(personalTaskService.createTask(principal.getUserId(), request));
    }

    @PutMapping("/{taskId}")
    public ResponseEntity<PersonalTaskResponse.Detail> updateTask(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String taskId,
            @Valid @RequestBody PersonalTaskRequest.Update request) {
        return ResponseEntity.ok(personalTaskService.updateTask(principal.getUserId(), taskId, request));
    }

    @PatchMapping("/{taskId}/status")
    public ResponseEntity<PersonalTaskResponse.Detail> updateTaskStatus(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String taskId,
            @RequestBody PersonalTaskRequest.StatusUpdate request) {
        return ResponseEntity.ok(personalTaskService.updateTaskStatus(principal.getUserId(), taskId, request));
    }

    @PutMapping("/{taskId}/position")
    public ResponseEntity<Void> updateTaskPosition(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String taskId,
            @RequestBody PersonalTaskRequest.PositionUpdate request) {
        personalTaskService.updateTaskPosition(principal.getUserId(), taskId, request);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{taskId}")
    public ResponseEntity<Map<String, String>> deleteTask(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String taskId) {
        personalTaskService.deleteTask(principal.getUserId(), taskId);
        return ResponseEntity.ok(Map.of("message", "할 일이 삭제되었습니다"));
    }

    @GetMapping("/categories")
    public ResponseEntity<List<String>> getCategories(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(personalTaskService.getCategories(principal.getUserId()));
    }

    // ─── Checklists ───

    @PostMapping("/{taskId}/checklists")
    public ResponseEntity<PersonalTaskResponse.ChecklistItem> addChecklist(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String taskId,
            @Valid @RequestBody PersonalTaskRequest.ChecklistCreate request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(personalTaskService.addChecklist(principal.getUserId(), taskId, request));
    }

    @PutMapping("/{taskId}/checklists/{checklistId}")
    public ResponseEntity<PersonalTaskResponse.ChecklistItem> updateChecklist(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String taskId,
            @PathVariable String checklistId,
            @Valid @RequestBody PersonalTaskRequest.ChecklistUpdate request) {
        return ResponseEntity.ok(personalTaskService.updateChecklist(principal.getUserId(), taskId, checklistId, request));
    }

    @PatchMapping("/{taskId}/checklists/{checklistId}/toggle")
    public ResponseEntity<PersonalTaskResponse.ChecklistItem> toggleChecklist(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String taskId,
            @PathVariable String checklistId) {
        return ResponseEntity.ok(personalTaskService.toggleChecklist(principal.getUserId(), taskId, checklistId));
    }

    @DeleteMapping("/{taskId}/checklists/{checklistId}")
    public ResponseEntity<Void> deleteChecklist(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String taskId,
            @PathVariable String checklistId) {
        personalTaskService.deleteChecklist(principal.getUserId(), taskId, checklistId);
        return ResponseEntity.noContent().build();
    }

    // ─── Tags assignment ───

    @PostMapping("/{taskId}/tags/{tagId}")
    public ResponseEntity<Void> assignTag(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String taskId,
            @PathVariable String tagId) {
        personalTaskService.assignTag(principal.getUserId(), taskId, tagId);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @DeleteMapping("/{taskId}/tags/{tagId}")
    public ResponseEntity<Void> unassignTag(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String taskId,
            @PathVariable String tagId) {
        personalTaskService.unassignTag(principal.getUserId(), taskId, tagId);
        return ResponseEntity.noContent().build();
    }
}
