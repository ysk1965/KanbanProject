package com.kanban.domain.comment.controller;

import com.kanban.domain.comment.dto.CommentResponse;
import com.kanban.domain.comment.service.CommentService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/comments")
@RequiredArgsConstructor
public class BoardCommentController {

    private final CommentService commentService;

    @GetMapping("/summary")
    public ResponseEntity<CommentResponse.SummaryListResponse> getCommentSummary(
            @PathVariable String boardId,
            @RequestParam String authorId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @AuthenticationPrincipal UserPrincipal principal) {
        CommentResponse.SummaryListResponse response =
                commentService.getCommentsByAuthorAndDateRange(
                        boardId, authorId, principal.getUserId(), startDate, endDate);
        return ResponseEntity.ok(response);
    }
}
