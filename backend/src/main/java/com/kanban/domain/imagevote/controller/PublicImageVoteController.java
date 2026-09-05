package com.kanban.domain.imagevote.controller;

import com.kanban.domain.imagevote.dto.ImageVoteRequest;
import com.kanban.domain.imagevote.dto.ImageVoteResponse;
import com.kanban.domain.imagevote.service.ImageVoteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** 공개 Top3 이미지 투표 — 인증 불필요 (/api/v1/public/** permitAll). */
@RestController
@RequestMapping("/api/v1/public/image-votes")
@RequiredArgsConstructor
public class PublicImageVoteController {

    private final ImageVoteService imageVoteService;

    @GetMapping("/{token}")
    public ResponseEntity<ImageVoteResponse.PublicVote> getVote(
            @PathVariable String token,
            @RequestParam(name = "voter_key", required = false) String voterKey) {
        return ResponseEntity.ok(imageVoteService.getPublicVote(token, voterKey));
    }

    @PostMapping("/{token}/ballots")
    public ResponseEntity<Void> submitBallot(
            @PathVariable String token,
            @Valid @RequestBody ImageVoteRequest.Ballot request) {
        imageVoteService.submitBallot(token, request);
        return ResponseEntity.ok().build();
    }
}
