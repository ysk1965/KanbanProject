package com.kanban.domain.imagevote.controller;

import com.kanban.domain.imagevote.dto.ImageVoteRequest;
import com.kanban.domain.imagevote.dto.ImageVoteResponse;
import com.kanban.domain.imagevote.service.ImageVoteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 공개 Top3 이미지 투표 — 인증 불필요 (/api/v1/public/** permitAll).
 * /{token}: 투표용 · /manage/{adminToken}: 결과 조회·종료용 (토큰 분리).
 */
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

    // ── 결과·관리 (관리 토큰) ─────────────────────────────

    @GetMapping("/manage/{adminToken}")
    public ResponseEntity<ImageVoteResponse.AdminVote> getAdminVote(@PathVariable String adminToken) {
        return ResponseEntity.ok(imageVoteService.getAdminVote(adminToken));
    }

    @PostMapping("/manage/{adminToken}/close")
    public ResponseEntity<ImageVoteResponse.AdminVote> close(@PathVariable String adminToken) {
        return ResponseEntity.ok(imageVoteService.close(adminToken));
    }

    @PostMapping("/manage/{adminToken}/reopen")
    public ResponseEntity<ImageVoteResponse.AdminVote> reopen(@PathVariable String adminToken) {
        return ResponseEntity.ok(imageVoteService.reopen(adminToken));
    }

    @PostMapping("/{token}/ballots")
    public ResponseEntity<Void> submitBallot(
            @PathVariable String token,
            @Valid @RequestBody ImageVoteRequest.Ballot request) {
        imageVoteService.submitBallot(token, request);
        return ResponseEntity.ok().build();
    }
}
