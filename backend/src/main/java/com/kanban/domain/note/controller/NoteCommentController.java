package com.kanban.domain.note.controller;

import com.kanban.domain.integration.FrontendOriginResolver;
import com.kanban.domain.note.dto.NoteCommentRequest;
import com.kanban.domain.note.dto.NoteCommentResponse;
import com.kanban.domain.note.service.NoteCommentService;
import com.kanban.global.security.UserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/notes/{noteId}/comments")
@RequiredArgsConstructor
public class NoteCommentController {

    private final NoteCommentService noteCommentService;

    @GetMapping
    public ResponseEntity<NoteCommentResponse.ListResponse> getComments(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        NoteCommentResponse.ListResponse response =
                noteCommentService.getComments(boardId, noteId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<NoteCommentResponse.Detail> createComment(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteCommentRequest.Create request,
            @RequestHeader(value = "Origin", required = false) String origin,
            HttpServletRequest httpRequest) {
        String resolvedOrigin = FrontendOriginResolver.resolveFrontendUrl(
                origin, httpRequest.getHeader("X-Forwarded-Host"), null);
        NoteCommentResponse.Detail response = noteCommentService.createComment(
                boardId, noteId, principal.getUserId(), request, resolvedOrigin);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{commentId}")
    public ResponseEntity<NoteCommentResponse.Detail> updateComment(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteCommentRequest.Update request) {
        NoteCommentResponse.Detail response = noteCommentService.updateComment(
                boardId, commentId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{commentId}")
    public ResponseEntity<Map<String, String>> deleteComment(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal) {
        noteCommentService.deleteComment(boardId, commentId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "노트 댓글이 삭제되었습니다"));
    }

    @PostMapping("/{commentId}/resolve")
    public ResponseEntity<NoteCommentResponse.Detail> toggleResolved(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal) {
        NoteCommentResponse.Detail response = noteCommentService.toggleResolved(
                boardId, commentId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{commentId}/reactions/toggle")
    public ResponseEntity<NoteCommentResponse.ReactionsResponse> toggleReaction(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteCommentRequest.ToggleReaction request) {
        NoteCommentResponse.ReactionsResponse response = noteCommentService.toggleReaction(
                boardId, noteId, commentId, request, principal.getUserId());
        return ResponseEntity.ok(response);
    }
}
