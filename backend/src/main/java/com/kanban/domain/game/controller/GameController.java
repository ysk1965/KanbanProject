package com.kanban.domain.game.controller;

import com.kanban.domain.game.dto.GameDto;
import com.kanban.domain.game.service.GameService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** 설교 노트 챌린지 — 게임(말씀 산성비 · 66권 줄 세우기). 계약서: docs/Tech/sermon-challenge-api.md §4 */
@RestController
@RequestMapping("/api/v1/challenge/games")
@RequiredArgsConstructor
public class GameController {

    private final GameService gameService;

    @PostMapping("/rain/runs")
    public ResponseEntity<GameDto.RainRun> startRain(
            @AuthenticationPrincipal UserPrincipal principal, @RequestBody GameDto.RainStart request) {
        return ResponseEntity.ok(gameService.startRain(principal.getUserId(), request));
    }

    @PostMapping("/rain/runs/{runId}/finish")
    public ResponseEntity<GameDto.RainResult> finishRain(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String runId,
            @RequestBody GameDto.RainFinish request) {
        return ResponseEntity.ok(gameService.finishRain(principal.getUserId(), runId, request));
    }

    @PostMapping("/books/runs")
    public ResponseEntity<GameDto.BooksRun> startBooks(
            @AuthenticationPrincipal UserPrincipal principal, @RequestBody GameDto.BooksStart request) {
        return ResponseEntity.ok(gameService.startBooks(principal.getUserId(), request));
    }

    @PostMapping("/books/runs/{runId}/finish")
    public ResponseEntity<GameDto.BooksResult> finishBooks(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String runId,
            @RequestBody GameDto.BooksFinish request) {
        return ResponseEntity.ok(gameService.finishBooks(principal.getUserId(), runId, request));
    }

    @GetMapping("/{game}/best")
    public ResponseEntity<GameDto.Best> best(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String game,
            @RequestParam(required = false) String stage) {
        return ResponseEntity.ok(gameService.best(principal.getUserId(), game, stage));
    }
}
