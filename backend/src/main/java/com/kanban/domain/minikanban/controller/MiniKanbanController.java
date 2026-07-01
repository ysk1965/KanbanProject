package com.kanban.domain.minikanban.controller;

import com.kanban.domain.minikanban.dto.MiniKanbanRequest;
import com.kanban.domain.minikanban.dto.MiniKanbanResponse;
import com.kanban.domain.minikanban.service.MiniKanbanService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/mini-kanban")
@RequiredArgsConstructor
public class MiniKanbanController {

    private final MiniKanbanService miniKanbanService;

    @GetMapping
    public ResponseEntity<MiniKanbanResponse> getMiniKanban(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(miniKanbanService.getMiniKanban(boardId, principal.getUserId()));
    }

    @PutMapping
    public ResponseEntity<MiniKanbanResponse> saveMiniKanban(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody MiniKanbanRequest.Save request) {
        return ResponseEntity.ok(miniKanbanService.saveMiniKanban(boardId, principal.getUserId(), request));
    }
}
