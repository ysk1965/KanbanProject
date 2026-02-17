package com.kanban.domain.board.controller;

import com.kanban.domain.board.dto.TodayResponse;
import com.kanban.domain.board.service.BoardTodayService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/today")
@RequiredArgsConstructor
public class BoardTodayController {

    private final BoardTodayService boardTodayService;

    @GetMapping
    public ResponseEntity<TodayResponse> getToday(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        TodayResponse response = boardTodayService.getToday(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }
}
