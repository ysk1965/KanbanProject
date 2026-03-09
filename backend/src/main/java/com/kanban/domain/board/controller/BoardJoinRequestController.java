package com.kanban.domain.board.controller;

import com.kanban.domain.board.dto.BoardJoinRequestDTO;
import com.kanban.domain.board.service.BoardJoinRequestService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/join-requests")
@RequiredArgsConstructor
public class BoardJoinRequestController {

    private final BoardJoinRequestService boardJoinRequestService;

    @PostMapping
    public ResponseEntity<BoardJoinRequestDTO.Detail> createJoinRequest(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody(required = false) BoardJoinRequestDTO.CreateRequest request) {
        String message = request != null ? request.getMessage() : null;
        BoardJoinRequestDTO.Detail response = boardJoinRequestService
                .createJoinRequest(boardId, principal.getUserId(), message);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ResponseEntity<BoardJoinRequestDTO.ListResponse> getJoinRequests(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        BoardJoinRequestDTO.ListResponse response = boardJoinRequestService
                .getJoinRequests(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PatchMapping("/{requestId}/approve")
    public ResponseEntity<BoardJoinRequestDTO.Detail> approveRequest(
            @PathVariable String boardId,
            @PathVariable String requestId,
            @AuthenticationPrincipal UserPrincipal principal) {
        BoardJoinRequestDTO.Detail response = boardJoinRequestService
                .approveRequest(boardId, requestId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PatchMapping("/{requestId}/reject")
    public ResponseEntity<BoardJoinRequestDTO.Detail> rejectRequest(
            @PathVariable String boardId,
            @PathVariable String requestId,
            @AuthenticationPrincipal UserPrincipal principal) {
        BoardJoinRequestDTO.Detail response = boardJoinRequestService
                .rejectRequest(boardId, requestId, principal.getUserId());
        return ResponseEntity.ok(response);
    }
}
