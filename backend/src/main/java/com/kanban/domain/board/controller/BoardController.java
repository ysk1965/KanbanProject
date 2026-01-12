package com.kanban.domain.board.controller;

import com.kanban.domain.board.dto.BoardRequest;
import com.kanban.domain.board.dto.BoardResponse;
import com.kanban.domain.board.service.BoardService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards")
@RequiredArgsConstructor
public class BoardController {

    private final BoardService boardService;

    @PostMapping
    public ResponseEntity<BoardResponse.Detail> createBoard(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BoardRequest.Create request) {
        BoardResponse.Detail response = boardService.createBoard(principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ResponseEntity<List<BoardResponse.Simple>> getMyBoards(
            @AuthenticationPrincipal UserPrincipal principal) {
        List<BoardResponse.Simple> response = boardService.getMyBoards(principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{boardId}")
    public ResponseEntity<BoardResponse.Detail> getBoard(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        BoardResponse.Detail response = boardService.getBoard(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{boardId}")
    public ResponseEntity<BoardResponse.Detail> updateBoard(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BoardRequest.Update request) {
        BoardResponse.Detail response = boardService.updateBoard(boardId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{boardId}")
    public ResponseEntity<Map<String, String>> deleteBoard(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        boardService.deleteBoard(boardId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "보드가 삭제되었습니다"));
    }

    @PatchMapping("/{boardId}/star")
    public ResponseEntity<BoardResponse.StarToggle> toggleStar(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        BoardResponse.StarToggle response = boardService.toggleStar(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PatchMapping("/{boardId}/selected-milestone")
    public ResponseEntity<BoardResponse.Detail> updateSelectedMilestone(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody BoardRequest.UpdateSelectedMilestone request) {
        BoardResponse.Detail response = boardService.updateSelectedMilestone(
                boardId, principal.getUserId(), request.getMilestoneId());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{boardId}/tier")
    public ResponseEntity<BoardResponse.TierInfo> getBoardTier(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        BoardResponse.TierInfo response = boardService.getBoardTier(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{boardId}/limits")
    public ResponseEntity<BoardResponse.Limits> getBoardLimits(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        BoardResponse.Limits response = boardService.getBoardLimits(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }
}
