package com.kanban.domain.jobrole.controller;

import com.kanban.domain.jobrole.dto.JobRoleRequest;
import com.kanban.domain.jobrole.dto.JobRoleResponse;
import com.kanban.domain.jobrole.service.JobRoleService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/job-roles")
@RequiredArgsConstructor
public class JobRoleController {

    private final JobRoleService jobRoleService;

    @GetMapping
    public ResponseEntity<JobRoleResponse.ListResponse> list(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(jobRoleService.list(boardId, principal.getUserId()));
    }

    @PostMapping
    public ResponseEntity<JobRoleResponse.Detail> create(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody JobRoleRequest.Create request) {
        JobRoleResponse.Detail response = jobRoleService.create(boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{roleId}")
    public ResponseEntity<JobRoleResponse.Detail> update(
            @PathVariable String boardId,
            @PathVariable String roleId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody JobRoleRequest.Update request) {
        JobRoleResponse.Detail response = jobRoleService.update(boardId, roleId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{roleId}")
    public ResponseEntity<Map<String, String>> delete(
            @PathVariable String boardId,
            @PathVariable String roleId,
            @AuthenticationPrincipal UserPrincipal principal) {
        jobRoleService.delete(boardId, roleId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "직군이 삭제되었습니다"));
    }

    @PutMapping("/reorder")
    public ResponseEntity<JobRoleResponse.ListResponse> reorder(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody JobRoleRequest.Reorder request) {
        JobRoleResponse.ListResponse response = jobRoleService.reorder(boardId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }
}
