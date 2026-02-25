package com.kanban.domain.organization.controller;

import com.kanban.domain.organization.dto.OrgInviteRequest;
import com.kanban.domain.organization.dto.OrgInviteResponse;
import com.kanban.domain.organization.service.OrgInviteService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class OrgInviteController {

    private final OrgInviteService orgInviteService;

    // ==================== Admin endpoints (under /organizations/{orgId}) ====================

    @PostMapping("/api/v1/organizations/{orgId}/invites")
    public ResponseEntity<OrgInviteResponse.Detail> createInviteLink(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody OrgInviteRequest.Create request) {
        OrgInviteResponse.Detail response = orgInviteService.createInviteLink(
                orgId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/api/v1/organizations/{orgId}/invites")
    public ResponseEntity<List<OrgInviteResponse.Detail>> getInviteLinks(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<OrgInviteResponse.Detail> response = orgInviteService.getInviteLinks(
                orgId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/api/v1/organizations/{orgId}/invites/{linkId}")
    public ResponseEntity<Void> deleteInviteLink(
            @PathVariable String orgId,
            @PathVariable String linkId,
            @AuthenticationPrincipal UserPrincipal principal) {
        orgInviteService.deleteInviteLink(orgId, linkId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    // ==================== Public endpoints (under /org-invites) ====================

    @GetMapping("/api/v1/org-invites/{code}")
    public ResponseEntity<OrgInviteResponse.PublicInfo> getInviteInfo(
            @PathVariable String code) {
        OrgInviteResponse.PublicInfo response = orgInviteService.getInviteInfo(code);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/api/v1/org-invites/{code}/accept")
    public ResponseEntity<Map<String, String>> acceptInvite(
            @PathVariable String code,
            @AuthenticationPrincipal UserPrincipal principal) {
        orgInviteService.acceptInvite(code, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "조직에 가입되었습니다."));
    }
}
