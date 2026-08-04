package com.kanban.domain.personal.controller;

import com.kanban.domain.integration.FrontendOriginResolver;
import com.kanban.domain.personal.dto.PersonalTaskRequest;
import com.kanban.domain.personal.dto.PersonalTaskResponse;
import com.kanban.domain.personal.service.PersonalTaskService;
import com.kanban.global.security.UserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
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

    /**
     * boardId가 오면 그 보드의 백로그 레일 목록, 없으면 기존 마이스페이스 전체 목록.
     */
    @GetMapping
    public ResponseEntity<List<PersonalTaskResponse.Detail>> getTasks(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "board_id", required = false) String boardId) {
        if (boardId != null && !boardId.isBlank()) {
            return ResponseEntity.ok(personalTaskService.getBacklog(principal.getUserId(), boardId));
        }
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

    /** 백로그 항목 승격 — 타임블록 · 태스크 · 체크리스트 항목 */
    @PostMapping("/{taskId}/promote")
    public ResponseEntity<PersonalTaskResponse.Detail> promote(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String taskId,
            @Valid @RequestBody PersonalTaskRequest.Promote request,
            @RequestHeader(value = "Origin", required = false) String origin,
            HttpServletRequest httpRequest) {
        String resolvedOrigin = FrontendOriginResolver.resolveFrontendUrl(
                origin, httpRequest.getHeader("X-Forwarded-Host"), null);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(personalTaskService.promote(principal.getUserId(), taskId, request, resolvedOrigin));
    }

    /** 승격 되돌리기 — 만들어진 대상은 그대로 두고 백로그 항목만 대기로 되돌린다 */
    @DeleteMapping("/{taskId}/promote")
    public ResponseEntity<PersonalTaskResponse.Detail> unpromote(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String taskId) {
        return ResponseEntity.ok(personalTaskService.unpromote(principal.getUserId(), taskId));
    }

    @GetMapping("/categories")
    public ResponseEntity<List<String>> getCategories(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(personalTaskService.getCategories(principal.getUserId()));
    }

}
