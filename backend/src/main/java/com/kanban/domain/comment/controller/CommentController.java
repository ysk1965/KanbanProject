package com.kanban.domain.comment.controller;

import com.kanban.domain.comment.dto.CommentRequest;
import com.kanban.domain.comment.dto.CommentResponse;
import com.kanban.domain.comment.service.CommentService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/tasks/{taskId}/comments")
@RequiredArgsConstructor
public class CommentController {

    private final CommentService commentService;

    @GetMapping
    public ResponseEntity<CommentResponse.ListResponse> getComments(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal) {
        CommentResponse.ListResponse response = commentService.getComments(boardId, taskId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<CommentResponse.Detail> createComment(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CommentRequest.Create request) {
        CommentResponse.Detail response = commentService.createComment(boardId, taskId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{commentId}")
    public ResponseEntity<CommentResponse.Detail> updateComment(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CommentRequest.Update request) {
        CommentResponse.Detail response = commentService.updateComment(boardId, commentId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{commentId}")
    public ResponseEntity<Map<String, String>> deleteComment(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal) {
        commentService.deleteComment(boardId, commentId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "댓글이 삭제되었습니다"));
    }
}
