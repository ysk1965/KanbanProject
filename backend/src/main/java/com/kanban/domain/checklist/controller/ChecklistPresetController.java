package com.kanban.domain.checklist.controller;

import com.kanban.domain.checklist.dto.ChecklistPresetRequest;
import com.kanban.domain.checklist.dto.ChecklistPresetResponse;
import com.kanban.domain.checklist.service.ChecklistPresetService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/checklist-presets")
@RequiredArgsConstructor
public class ChecklistPresetController {

    private final ChecklistPresetService checklistPresetService;

    @GetMapping
    public ResponseEntity<ChecklistPresetResponse.ListResponse> getPresets(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        ChecklistPresetResponse.ListResponse response = checklistPresetService.getPresets(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<ChecklistPresetResponse.Detail> createPreset(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ChecklistPresetRequest.Save request) {
        ChecklistPresetResponse.Detail response = checklistPresetService.createPreset(boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{presetId}")
    public ResponseEntity<ChecklistPresetResponse.Detail> updatePreset(
            @PathVariable String boardId,
            @PathVariable String presetId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ChecklistPresetRequest.Save request) {
        ChecklistPresetResponse.Detail response = checklistPresetService.updatePreset(boardId, presetId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{presetId}")
    public ResponseEntity<Map<String, String>> deletePreset(
            @PathVariable String boardId,
            @PathVariable String presetId,
            @AuthenticationPrincipal UserPrincipal principal) {
        checklistPresetService.deletePreset(boardId, presetId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "체크리스트 프리셋이 삭제되었습니다"));
    }
}
