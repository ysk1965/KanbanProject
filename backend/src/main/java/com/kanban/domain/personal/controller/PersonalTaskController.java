package com.kanban.domain.personal.controller;

import com.kanban.domain.integration.FrontendOriginResolver;
import com.kanban.domain.personal.dto.PersonalTaskRequest;
import com.kanban.domain.personal.dto.PersonalTaskResponse;
import com.kanban.domain.personal.service.PersonalTaskService;
import com.kanban.domain.personal.service.PromoteSuggestionService;
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
    private final PromoteSuggestionService promoteSuggestionService;

    /**
     * boardId가 오면 그 보드의 백로그 목록, 없으면 기존 마이스페이스 전체 목록.
     *
     * <p>userId까지 오면 같은 보드에 있는 그 멤버의 백로그를 읽기 전용으로 돌려준다
     * (대시보드 스코프 전환). board_id 없이는 남의 목록을 조회할 수 없다 —
     * 마이스페이스 개인 할 일은 어떤 경로로도 열리지 않는다.
     */
    @GetMapping
    public ResponseEntity<List<PersonalTaskResponse.Detail>> getTasks(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "board_id", required = false) String boardId,
            @RequestParam(name = "user_id", required = false) String userId) {
        if (boardId != null && !boardId.isBlank()) {
            if (userId != null && !userId.isBlank()) {
                return ResponseEntity.ok(
                        personalTaskService.getMemberBacklog(principal.getUserId(), boardId, userId));
            }
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

    /**
     * 붙일 곳 후보 추천 — 규칙 점수(무료) 또는 AI 선별(크레딧 1).
     *
     * <p>크레딧이 없거나 AI가 실패해도 402로 끊지 않고 규칙 추천을 돌려준다.
     * 추천이 안 된다고 승격 자체를 막을 이유가 없다.
     */
    @PostMapping("/{taskId}/promote-suggestions")
    public ResponseEntity<PersonalTaskResponse.PromoteSuggestions> promoteSuggestions(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String taskId,
            @Valid @RequestBody PersonalTaskRequest.Suggest request) {
        return ResponseEntity.ok(
                promoteSuggestionService.suggest(principal.getUserId(), taskId, request));
    }

    @GetMapping("/categories")
    public ResponseEntity<List<String>> getCategories(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(personalTaskService.getCategories(principal.getUserId()));
    }

}
