package com.kanban.domain.user.controller;

import com.kanban.domain.user.service.UserTaskService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/users/me/tasks")
@RequiredArgsConstructor
public class UserTaskController {

    private final UserTaskService userTaskService;

    /**
     * 내 모든 보드의 Task 통합 조회
     * @param filter today | week | overdue
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> getMyTasks(
            @RequestParam(required = false, defaultValue = "today") String filter,
            @AuthenticationPrincipal UserPrincipal principal) {
        Map<String, Object> response = userTaskService.getMyTasks(principal.getUserId(), filter);
        return ResponseEntity.ok(response);
    }
}
