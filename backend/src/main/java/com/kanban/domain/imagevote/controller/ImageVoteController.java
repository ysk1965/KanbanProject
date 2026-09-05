package com.kanban.domain.imagevote.controller;

import com.kanban.domain.imagevote.dto.ImageVoteRequest;
import com.kanban.domain.imagevote.dto.ImageVoteResponse;
import com.kanban.domain.imagevote.service.ImageVoteService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/notes/{noteId}/image-votes")
@RequiredArgsConstructor
public class ImageVoteController {

    private final ImageVoteService imageVoteService;

    @PostMapping
    public ResponseEntity<ImageVoteResponse.Created> create(
            @PathVariable String boardId,
            @PathVariable String noteId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ImageVoteRequest.Create request) {
        ImageVoteResponse.Created created =
                imageVoteService.create(boardId, noteId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
