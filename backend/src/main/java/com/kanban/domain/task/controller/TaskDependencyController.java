package com.kanban.domain.task.controller;

import com.kanban.domain.task.dto.TaskDependencyDto;
import com.kanban.domain.task.service.TaskDependencyService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/task-dependencies")
@RequiredArgsConstructor
public class TaskDependencyController {

    private final TaskDependencyService taskDependencyService;

    @GetMapping
    public ResponseEntity<List<TaskDependencyDto.Response>> getDependencies(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<TaskDependencyDto.Response> response = taskDependencyService.getDependencies(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<TaskDependencyDto.Response> createDependency(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody TaskDependencyDto.CreateRequest request) {
        TaskDependencyDto.Response response = taskDependencyService.createDependency(boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @DeleteMapping("/{dependencyId}")
    public ResponseEntity<Void> deleteDependency(
            @PathVariable String boardId,
            @PathVariable String dependencyId,
            @AuthenticationPrincipal UserPrincipal principal) {
        taskDependencyService.deleteDependency(boardId, principal.getUserId(), dependencyId);
        return ResponseEntity.noContent().build();
    }
}
