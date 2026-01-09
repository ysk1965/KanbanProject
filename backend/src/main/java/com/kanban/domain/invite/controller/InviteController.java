package com.kanban.domain.invite.controller;

import com.kanban.domain.invite.dto.InviteRequest;
import com.kanban.domain.invite.dto.InviteResponse;
import com.kanban.domain.invite.service.InviteService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
public class InviteController {

    private final InviteService inviteService;

    // Board 내 초대 링크 관리 API
    @GetMapping("/api/v1/boards/{boardId}/invites")
    public ResponseEntity<InviteResponse.ListResponse> getInviteLinks(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        InviteResponse.ListResponse response = inviteService.getInviteLinks(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/api/v1/boards/{boardId}/invites")
    public ResponseEntity<InviteResponse.Detail> createInviteLink(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody InviteRequest.Create request) {
        InviteResponse.Detail response = inviteService.createInviteLink(boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @DeleteMapping("/api/v1/boards/{boardId}/invites/{inviteId}")
    public ResponseEntity<Map<String, String>> deleteInviteLink(
            @PathVariable String boardId,
            @PathVariable String inviteId,
            @AuthenticationPrincipal UserPrincipal principal) {
        inviteService.deleteInviteLink(boardId, inviteId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "초대 링크가 비활성화되었습니다"));
    }

    // 공개 초대 링크 API
    @GetMapping("/api/v1/invites/{code}")
    public ResponseEntity<InviteResponse.Info> getInviteLinkInfo(@PathVariable String code) {
        InviteResponse.Info response = inviteService.getInviteLinkInfo(code);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/api/v1/invites/{code}/accept")
    public ResponseEntity<InviteResponse.AcceptResult> acceptInvite(
            @PathVariable String code,
            @AuthenticationPrincipal UserPrincipal principal) {
        InviteResponse.AcceptResult response = inviteService.acceptInvite(code, principal.getUserId());
        return ResponseEntity.ok(response);
    }
}
