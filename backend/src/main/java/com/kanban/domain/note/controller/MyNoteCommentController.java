package com.kanban.domain.note.controller;

import com.kanban.domain.note.dto.NoteCommentRequest;
import com.kanban.domain.note.dto.NoteCommentResponse;
import com.kanban.domain.note.service.MyNoteCommentService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 개인 노트 댓글 API. {@link OrgNoteCommentController} 의 owner-scope 미러.
 */
@RestController
@RequestMapping("/api/v1/me/notes/{noteId}/comments")
@RequiredArgsConstructor
public class MyNoteCommentController {

    private final MyNoteCommentService myNoteCommentService;

    @GetMapping
    public ResponseEntity<NoteCommentResponse.ListResponse> getComments(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(myNoteCommentService.getComments(noteId, principal.getUserId()));
    }

    @PostMapping
    public ResponseEntity<NoteCommentResponse.Detail> createComment(
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteCommentRequest.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(myNoteCommentService.createComment(noteId, principal.getUserId(), request));
    }

    @PutMapping("/{commentId}")
    public ResponseEntity<NoteCommentResponse.Detail> updateComment(
            @PathVariable String noteId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteCommentRequest.Update request) {
        return ResponseEntity.ok(myNoteCommentService.updateComment(commentId, principal.getUserId(), request));
    }

    @DeleteMapping("/{commentId}")
    public ResponseEntity<Map<String, String>> deleteComment(
            @PathVariable String noteId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal) {
        myNoteCommentService.deleteComment(commentId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "노트 댓글이 삭제되었습니다"));
    }

    @PostMapping("/{commentId}/resolve")
    public ResponseEntity<NoteCommentResponse.Detail> toggleResolved(
            @PathVariable String noteId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(myNoteCommentService.toggleResolved(commentId, principal.getUserId()));
    }

    @PostMapping("/{commentId}/reactions/toggle")
    public ResponseEntity<NoteCommentResponse.ReactionsResponse> toggleReaction(
            @PathVariable String noteId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody NoteCommentRequest.ToggleReaction request) {
        return ResponseEntity.ok(myNoteCommentService.toggleReaction(noteId, commentId, request, principal.getUserId()));
    }
}
