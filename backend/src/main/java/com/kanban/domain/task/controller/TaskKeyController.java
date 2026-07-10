package com.kanban.domain.task.controller;

import com.kanban.domain.task.dto.TaskKeyResponse;
import com.kanban.domain.task.service.TaskService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 사람이 읽는 태스크 키(예: STORY-42) 해석 엔드포인트.
 * 보드 스코프 밖의 최상위 경로로, 키 → { board_id, task_id } 를 반환한다(권한 검증 포함).
 */
@RestController
@RequestMapping("/api/v1/task-keys")
@RequiredArgsConstructor
public class TaskKeyController {

    private final TaskService taskService;

    @GetMapping("/{key}")
    public ResponseEntity<TaskKeyResponse> resolve(
            @PathVariable String key,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(taskService.resolveTaskKey(key, principal.getUserId()));
    }
}
