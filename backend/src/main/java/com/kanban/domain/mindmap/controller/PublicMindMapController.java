package com.kanban.domain.mindmap.controller;

import com.kanban.domain.mindmap.dto.PublicMindMapResponse;
import com.kanban.domain.mindmap.service.MindMapShareService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** 마인드맵 공개 스냅샷 — 인증 불요 (/api/v1/public/** permitAll, PublicNoteController 선례) */
@RestController
@RequestMapping("/api/v1/public/mindmaps")
@RequiredArgsConstructor
public class PublicMindMapController {

    private final MindMapShareService mindMapShareService;

    @GetMapping("/{shareCode}")
    public ResponseEntity<PublicMindMapResponse> getPublicSnapshot(
            @PathVariable String shareCode) {
        return ResponseEntity.ok(mindMapShareService.getPublicSnapshot(shareCode));
    }
}
