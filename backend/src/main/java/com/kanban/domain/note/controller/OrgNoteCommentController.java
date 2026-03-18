package com.kanban.domain.note.controller;

import com.kanban.domain.note.dto.NoteCommentRequest;
import com.kanban.domain.note.dto.NoteCommentResponse;
import com.kanban.domain.note.service.OrgNoteCommentService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}/notes/{noteId}/comments")
@RequiredArgsConstructor
public class OrgNoteCommentController {

    private final OrgNoteCommentService orgNoteCommentService;

    @GetMapping
    public ResponseEntity<NoteCommentResponse.ListResponse> getComments(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgNoteCommentService.getComments(orgId, noteId, principal.getUserId()));
    }

    @PostMapping
    public ResponseEntity<NoteCommentResponse.Detail> createComment(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteCommentRequest.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(orgNoteCommentService.createComment(orgId, noteId, principal.getUserId(), request));
    }

    @PutMapping("/{commentId}")
    public ResponseEntity<NoteCommentResponse.Detail> updateComment(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteCommentRequest.Update request) {
        return ResponseEntity.ok(orgNoteCommentService.updateComment(orgId, commentId, principal.getUserId(), request));
    }

    @DeleteMapping("/{commentId}")
    public ResponseEntity<Map<String, String>> deleteComment(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal) {
        orgNoteCommentService.deleteComment(orgId, commentId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "노트 댓글이 삭제되었습니다"));
    }

    @PostMapping("/{commentId}/resolve")
    public ResponseEntity<NoteCommentResponse.Detail> toggleResolved(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgNoteCommentService.toggleResolved(orgId, commentId, principal.getUserId()));
    }

    @PostMapping("/{commentId}/reactions/toggle")
    public ResponseEntity<NoteCommentResponse.ReactionsResponse> toggleReaction(
            @PathVariable String orgId,
            @PathVariable String noteId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteCommentRequest.ToggleReaction request) {
        return ResponseEntity.ok(orgNoteCommentService.toggleReaction(orgId, noteId, commentId, request, principal.getUserId()));
    }
}
