package com.kanban.domain.mindmap.controller;

import com.kanban.domain.mindmap.dto.MindMapRequest;
import com.kanban.domain.mindmap.dto.MindMapResponse;
import com.kanban.domain.mindmap.dto.MindMapShareRequest;
import com.kanban.domain.mindmap.dto.MindMapShareResponse;
import com.kanban.domain.mindmap.service.MindMapService;
import com.kanban.domain.mindmap.service.MindMapShareService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/mindmap")
@RequiredArgsConstructor
public class MindMapController {

    private final MindMapService mindMapService;
    private final MindMapShareService mindMapShareService;

    @GetMapping
    public ResponseEntity<MindMapResponse> getMindMap(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(mindMapService.getMindMap(boardId, principal.getUserId()));
    }

    @PutMapping
    public ResponseEntity<MindMapResponse> saveMindMap(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody MindMapRequest.Save request) {
        return ResponseEntity.ok(mindMapService.saveMindMap(boardId, principal.getUserId(), request));
    }

    // ==================== 외부 공유 설정 ====================

    @GetMapping("/share")
    public ResponseEntity<MindMapShareResponse> getShareSettings(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(mindMapShareService.getShareSettings(boardId, principal.getUserId()));
    }

    @PutMapping("/share")
    public ResponseEntity<MindMapShareResponse> updateShareSettings(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody MindMapShareRequest.Update request) {
        return ResponseEntity.ok(mindMapShareService.updateShareSettings(boardId, principal.getUserId(), request));
    }

    @PostMapping("/share/rotate")
    public ResponseEntity<MindMapShareResponse> rotateShareCode(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(mindMapShareService.rotateShareCode(boardId, principal.getUserId()));
    }
}
