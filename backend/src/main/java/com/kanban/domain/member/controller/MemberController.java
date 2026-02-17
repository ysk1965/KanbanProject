package com.kanban.domain.member.controller;

import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.member.dto.MemberRequest;
import com.kanban.domain.member.dto.MemberResponse;
import com.kanban.domain.member.service.MemberService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/members")
@RequiredArgsConstructor
public class MemberController {

    private final BoardService boardService;
    private final MemberService memberService;

    @GetMapping
    public ResponseEntity<MemberResponse.ListResponse> getMembers(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        MemberResponse.ListResponse response = memberService.getMembers(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/invite")
    public ResponseEntity<MemberResponse.InviteResult> inviteMember(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody MemberRequest.Invite request) {
        boardService.checkTeamBoardOnly(boardId);
        MemberResponse.InviteResult response = memberService.inviteMember(boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{memberId}/role")
    public ResponseEntity<MemberResponse.Detail> updateMemberRole(
            @PathVariable String boardId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody MemberRequest.UpdateRole request) {
        MemberResponse.Detail response = memberService.updateMemberRole(boardId, memberId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{memberId}/color")
    public ResponseEntity<MemberResponse.Detail> updateMemberColor(
            @PathVariable String boardId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody MemberRequest.UpdateColor request) {
        MemberResponse.Detail response = memberService.updateMemberColor(boardId, memberId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/reorder")
    public ResponseEntity<MemberResponse.ListResponse> reorderMembers(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody MemberRequest.ReorderMembers request) {
        MemberResponse.ListResponse response = memberService.reorderMembers(boardId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{memberId}")
    public ResponseEntity<Map<String, String>> removeMember(
            @PathVariable String boardId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal) {
        memberService.removeMember(boardId, memberId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "멤버가 내보내졌습니다"));
    }
}
