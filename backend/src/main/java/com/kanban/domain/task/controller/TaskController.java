package com.kanban.domain.task.controller;

import com.kanban.domain.task.dto.TaskRequest;
import com.kanban.domain.task.dto.TaskResponse;
import com.kanban.domain.task.service.TaskService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}")
@RequiredArgsConstructor
public class TaskController {

    private final TaskService taskService;

    @GetMapping("/tasks")
    public ResponseEntity<TaskResponse.ListResponse> getTasks(
            @PathVariable String boardId,
            @RequestParam(required = false) String blockId,
            @RequestParam(required = false) String featureId,
            @RequestParam(required = false) String milestoneId,
            @AuthenticationPrincipal UserPrincipal principal) {
        TaskResponse.ListResponse response = taskService.getTasks(boardId, principal.getUserId(), blockId, featureId, milestoneId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/tasks/{taskId}")
    public ResponseEntity<TaskResponse.Detail> getTask(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal) {
        TaskResponse.Detail response = taskService.getTask(boardId, taskId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/features/{featureId}/tasks")
    public ResponseEntity<TaskResponse.Detail> createTask(
            @PathVariable String boardId,
            @PathVariable String featureId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody TaskRequest.Create request) {
        TaskResponse.Detail response = taskService.createTask(boardId, featureId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/tasks/{taskId}")
    public ResponseEntity<TaskResponse.Detail> updateTask(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody TaskRequest.Update request) {
        TaskResponse.Detail response = taskService.updateTask(boardId, taskId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/tasks/{taskId}")
    public ResponseEntity<Map<String, String>> deleteTask(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal) {
        taskService.deleteTask(boardId, taskId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "Task가 삭제되었습니다"));
    }

    @PutMapping("/tasks/{taskId}/move")
    public ResponseEntity<TaskResponse.Detail> moveTask(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody TaskRequest.Move request) {
        TaskResponse.Detail response = taskService.moveTask(boardId, taskId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/tasks/{taskId}/dates")
    public ResponseEntity<TaskResponse.Detail> updateTaskDates(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody TaskRequest.UpdateDates request) {
        TaskResponse.Detail response = taskService.updateTaskDates(boardId, taskId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }
}
