package com.kanban.domain.sermongroup.controller;

import com.kanban.domain.sermongroup.dto.SermonGroupRequest;
import com.kanban.domain.sermongroup.dto.SermonGroupResponse;
import com.kanban.domain.sermongroup.service.SermonSessionService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** 설교 자리 · 공개 사본 · 반응. 계약서: docs/Tech/sermon-groups-api.md */
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class SermonSessionController {

    private final SermonSessionService sessionService;

    @PutMapping("/sermon-sessions/resolve")
    public ResponseEntity<SermonGroupResponse.SessionSummary> resolve(
            @AuthenticationPrincipal UserPrincipal principal, @RequestBody SermonGroupRequest.ResolveSession request) {
        return ResponseEntity.ok(sessionService.resolve(principal.getUserId(), request));
    }

    @GetMapping("/sermon-sessions/{sessionId}")
    public ResponseEntity<SermonGroupResponse.SessionDetail> get(
            @AuthenticationPrincipal UserPrincipal principal, @PathVariable String sessionId) {
        return ResponseEntity.ok(sessionService.get(principal.getUserId(), sessionId));
    }

    @PatchMapping("/sermon-sessions/{sessionId}")
    public ResponseEntity<SermonGroupResponse.SessionSummary> update(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String sessionId,
            @RequestBody SermonGroupRequest.UpdateSession request) {
        return ResponseEntity.ok(sessionService.update(principal.getUserId(), sessionId, request));
    }

    @PatchMapping("/sermon-sessions/{sessionId}/lock")
    public ResponseEntity<SermonGroupResponse.SessionSummary> lock(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String sessionId,
            @RequestBody SermonGroupRequest.Lock request) {
        return ResponseEntity.ok(sessionService.lock(principal.getUserId(), sessionId, request));
    }

    @PutMapping("/sermon-sessions/{sessionId}/share")
    public ResponseEntity<SermonGroupResponse.ShareView> putShare(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String sessionId,
            @RequestBody SermonGroupRequest.Share request) {
        return ResponseEntity.ok(sessionService.putShare(principal.getUserId(), sessionId, request));
    }

    @DeleteMapping("/sermon-sessions/{sessionId}/share")
    public ResponseEntity<Void> deleteShare(
            @AuthenticationPrincipal UserPrincipal principal, @PathVariable String sessionId) {
        sessionService.deleteShare(principal.getUserId(), sessionId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/sermon-shares/{shareId}/reactions")
    public ResponseEntity<SermonGroupResponse.ReactionCount> toggleReaction(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String shareId,
            @RequestBody SermonGroupRequest.Reaction request) {
        return ResponseEntity.ok(sessionService.toggleReaction(principal.getUserId(), shareId, request));
    }
}
