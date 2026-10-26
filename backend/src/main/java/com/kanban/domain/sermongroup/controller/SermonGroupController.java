package com.kanban.domain.sermongroup.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.sermongroup.dto.SermonGroupRequest;
import com.kanban.domain.sermongroup.dto.SermonGroupResponse;
import com.kanban.domain.sermongroup.service.SermonGroupService;
import com.kanban.domain.sermongroup.service.SermonSessionService;
import com.kanban.global.security.UserPrincipal;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * 설교 노트 「모임」. 계약서: docs/Tech/sermon-groups-api.md
 *
 * <p>GET /invite/{code} 만 공개(SecurityConfig permitAll) — 로그인 상태면 my_status 를 채운다.
 */
@RestController
@RequestMapping("/api/v1/sermon-groups")
@RequiredArgsConstructor
public class SermonGroupController {

    private final SermonGroupService groupService;
    private final SermonSessionService sessionService;

    @GetMapping
    public ResponseEntity<List<SermonGroupResponse.Detail>> list(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(groupService.list(principal.getUserId()));
    }

    @PostMapping
    public ResponseEntity<SermonGroupResponse.Detail> create(
            @AuthenticationPrincipal UserPrincipal principal, @RequestBody SermonGroupRequest.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(groupService.create(principal.getUserId(), request));
    }

    @GetMapping("/{groupId}")
    public ResponseEntity<SermonGroupResponse.Detail> get(
            @AuthenticationPrincipal UserPrincipal principal, @PathVariable String groupId) {
        return ResponseEntity.ok(groupService.get(principal.getUserId(), groupId));
    }

    @PatchMapping("/{groupId}")
    public ResponseEntity<SermonGroupResponse.Detail> patch(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String groupId,
            @RequestBody JsonNode body) {
        return ResponseEntity.ok(groupService.patch(principal.getUserId(), groupId, body));
    }

    @DeleteMapping("/{groupId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UserPrincipal principal, @PathVariable String groupId) {
        groupService.delete(principal.getUserId(), groupId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{groupId}/invite")
    public ResponseEntity<SermonGroupResponse.Detail> regenerateInvite(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String groupId,
            @RequestBody(required = false) SermonGroupRequest.Invite request) {
        return ResponseEntity.ok(groupService.regenerateInvite(principal.getUserId(), groupId, request));
    }

    @DeleteMapping("/{groupId}/invite")
    public ResponseEntity<SermonGroupResponse.Detail> disableInvite(
            @AuthenticationPrincipal UserPrincipal principal, @PathVariable String groupId) {
        return ResponseEntity.ok(groupService.disableInvite(principal.getUserId(), groupId));
    }

    // ───────────────── 초대·참여 ─────────────────

    /** 공개. start(이번 주 시작일, 선택)를 주면 this_week 를 start~start+6 으로 자른다. */
    @GetMapping("/invite/{code}")
    public ResponseEntity<SermonGroupResponse.InvitePreview> invitePreview(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String code,
            @RequestParam(name = "start", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate start) {
        String userId = principal == null ? null : principal.getUserId();
        return ResponseEntity.ok(groupService.invitePreview(userId, code, start));
    }

    @PostMapping("/invite/{code}/join")
    public ResponseEntity<SermonGroupResponse.Detail> join(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String code,
            @RequestBody(required = false) SermonGroupRequest.Join request) {
        return ResponseEntity.ok(groupService.join(principal.getUserId(), code, request));
    }

    // ───────────────── 멤버 ─────────────────

    @PatchMapping("/{groupId}/members/me")
    public ResponseEntity<SermonGroupResponse.Detail> updateMe(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String groupId,
            @RequestBody SermonGroupRequest.UpdateMe request) {
        return ResponseEntity.ok(groupService.updateMe(principal.getUserId(), groupId, request));
    }

    @DeleteMapping("/{groupId}/members/me")
    public ResponseEntity<Void> leave(@AuthenticationPrincipal UserPrincipal principal, @PathVariable String groupId) {
        groupService.leave(principal.getUserId(), groupId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{groupId}/members/{userId}/approve")
    public ResponseEntity<SermonGroupResponse.Detail> approve(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String groupId,
            @PathVariable String userId) {
        return ResponseEntity.ok(groupService.approve(principal.getUserId(), groupId, userId));
    }

    @DeleteMapping("/{groupId}/members/{userId}")
    public ResponseEntity<Void> kick(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String groupId,
            @PathVariable String userId) {
        groupService.kick(principal.getUserId(), groupId, userId);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{groupId}/members/{userId}")
    public ResponseEntity<SermonGroupResponse.Detail> changeRole(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String groupId,
            @PathVariable String userId,
            @RequestBody SermonGroupRequest.ChangeRole request) {
        return ResponseEntity.ok(groupService.changeRole(principal.getUserId(), groupId, userId, request));
    }

    // ───────────────── 이번 주 · 자리 열기 · 같이 써요 ─────────────────

    @GetMapping("/{groupId}/week")
    public ResponseEntity<SermonGroupResponse.Week> week(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String groupId,
            @RequestParam(name = "start") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start) {
        return ResponseEntity.ok(groupService.week(principal.getUserId(), groupId, start));
    }

    @PostMapping("/{groupId}/sessions")
    public ResponseEntity<SermonGroupResponse.SessionSummary> openSession(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String groupId,
            @RequestBody SermonGroupRequest.OpenSession request) {
        return ResponseEntity.ok(sessionService.open(principal.getUserId(), groupId, request));
    }

    @PostMapping("/{groupId}/pokes")
    public ResponseEntity<Void> poke(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String groupId,
            @RequestBody SermonGroupRequest.Poke request) {
        groupService.poke(principal.getUserId(), groupId, request);
        return ResponseEntity.noContent().build();
    }
}
