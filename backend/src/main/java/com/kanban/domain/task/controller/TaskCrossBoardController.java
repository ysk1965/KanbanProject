package com.kanban.domain.task.controller;

import com.kanban.domain.task.dto.TaskRequest;
import com.kanban.domain.task.dto.TaskResponse;
import com.kanban.domain.task.service.TaskMoveService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/tasks")
@RequiredArgsConstructor
public class TaskCrossBoardController {

    private final TaskMoveService taskMoveService;

    @PostMapping("/{taskId}/move")
    public ResponseEntity<TaskResponse.Simple> moveTaskToBoard(
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody TaskRequest.MoveToBoard request) {
        TaskResponse.Simple response = taskMoveService.moveTaskToBoard(taskId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{taskId}/copy")
    public ResponseEntity<TaskResponse.Simple> copyTaskToBoard(
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody TaskRequest.CopyToBoard request) {
        TaskResponse.Simple response = taskMoveService.copyTaskToBoard(taskId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}
