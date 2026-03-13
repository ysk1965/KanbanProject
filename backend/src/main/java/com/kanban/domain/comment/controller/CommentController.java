package com.kanban.domain.comment.controller;

import com.kanban.domain.comment.dto.CommentAIResponse;
import com.kanban.domain.comment.dto.CommentRequest;
import com.kanban.domain.comment.dto.CommentResponse;
import com.kanban.domain.comment.service.CommentAIService;
import com.kanban.domain.comment.service.CommentService;
import com.kanban.domain.integration.FrontendOriginResolver;
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
@RequestMapping("/api/v1/boards/{boardId}/tasks/{taskId}/comments")
@RequiredArgsConstructor
public class CommentController {

    private final CommentService commentService;
    private final CommentAIService commentAIService;

    @GetMapping
    public ResponseEntity<CommentResponse.ListResponse> getComments(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal) {
        CommentResponse.ListResponse response = commentService.getComments(boardId, taskId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    /**
     * 댓글 생성 (JSON)
     * 파일은 미리 /api/v1/files/upload 또는 /presign으로 업로드 후 fileKeys로 참조
     */
    @PostMapping
    public ResponseEntity<CommentResponse.Detail> createComment(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CommentRequest.Create request,
            @RequestHeader(value = "Origin", required = false) String origin,
            HttpServletRequest httpRequest) {
        String resolvedOrigin = FrontendOriginResolver.resolveFrontendUrl(
                origin, httpRequest.getHeader("X-Forwarded-Host"), null);
        CommentResponse.Detail response = commentService.createComment(
                boardId, taskId, principal.getUserId(), request, resolvedOrigin);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * 댓글 수정 (텍스트 + 첨부파일 추가/삭제)
     */
    @PutMapping("/{commentId}")
    public ResponseEntity<CommentResponse.Detail> updateComment(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CommentRequest.Update request) {
        CommentResponse.Detail response = commentService.updateComment(
                boardId, commentId, principal.getUserId(), request);
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

    @DeleteMapping("/{commentId}/attachments/{attachmentId}")
    public ResponseEntity<Map<String, String>> deleteAttachment(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @PathVariable String commentId,
            @PathVariable String attachmentId,
            @AuthenticationPrincipal UserPrincipal principal) {
        commentService.deleteAttachment(boardId, commentId, attachmentId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "첨부파일이 삭제되었습니다"));
    }

    @PostMapping("/{commentId}/reactions/toggle")
    public ResponseEntity<CommentResponse.ReactionsResponse> toggleReaction(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @PathVariable String commentId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CommentRequest.ToggleReaction request) {
        CommentResponse.ReactionsResponse response = commentService.toggleReaction(
                boardId, commentId, principal.getUserId(), request.getEmoji());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/ai/summarize")
    public ResponseEntity<CommentAIResponse.Summary> aiSummarize(
            @PathVariable String boardId,
            @PathVariable String taskId,
            @RequestParam(required = false) String language,
            @AuthenticationPrincipal UserPrincipal principal) {
        CommentAIResponse.Summary response = commentAIService.summarizeComments(
                boardId, taskId, principal.getUserId(), language);
        return ResponseEntity.ok(response);
    }
}
