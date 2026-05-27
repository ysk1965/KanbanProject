package com.kanban.domain.board.controller;

import com.kanban.domain.board.dto.BoardResourceRequest;
import com.kanban.domain.board.dto.BoardResourceResponse;
import com.kanban.domain.board.service.BoardResourceService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/resources")
@RequiredArgsConstructor
public class BoardResourceController {

    private final BoardResourceService boardResourceService;

    @GetMapping
    public ResponseEntity<BoardResourceResponse.ListResponse> getResources(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        BoardResourceResponse.ListResponse response =
                boardResourceService.getResources(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<BoardResourceResponse.Detail> createResource(
            @PathVariable String boardId,
            @Valid @RequestBody BoardResourceRequest.Create request,
            @AuthenticationPrincipal UserPrincipal principal) {
        BoardResourceResponse.Detail response =
                boardResourceService.createResource(boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{resourceId}")
    public ResponseEntity<BoardResourceResponse.Detail> updateResource(
            @PathVariable String boardId,
            @PathVariable String resourceId,
            @Valid @RequestBody BoardResourceRequest.Update request,
            @AuthenticationPrincipal UserPrincipal principal) {
        BoardResourceResponse.Detail response =
                boardResourceService.updateResource(boardId, resourceId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{resourceId}")
    public ResponseEntity<Map<String, String>> deleteResource(
            @PathVariable String boardId,
            @PathVariable String resourceId,
            @AuthenticationPrincipal UserPrincipal principal) {
        boardResourceService.deleteResource(boardId, resourceId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "리소스가 삭제되었습니다"));
    }

    @PostMapping("/refresh-favicons")
    public ResponseEntity<BoardResourceResponse.ListResponse> refreshFavicons(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        BoardResourceResponse.ListResponse response =
                boardResourceService.refreshFavicons(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PutMapping("/reorder")
    public ResponseEntity<BoardResourceResponse.ListResponse> reorderResources(
            @PathVariable String boardId,
            @Valid @RequestBody BoardResourceRequest.Reorder request,
            @AuthenticationPrincipal UserPrincipal principal) {
        BoardResourceResponse.ListResponse response =
                boardResourceService.reorderResources(boardId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }
}
