package com.kanban.domain.organization.controller;

import com.kanban.domain.organization.dto.OrgAnnouncementRequest;
import com.kanban.domain.organization.dto.OrgAnnouncementResponse;
import com.kanban.domain.organization.service.OrgAnnouncementService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}/announcements")
@RequiredArgsConstructor
public class OrgAnnouncementController {

    private final OrgAnnouncementService announcementService;

    @GetMapping
    public ResponseEntity<OrgAnnouncementResponse.ListResponse> getAnnouncements(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime cursor,
            @RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(
                announcementService.getAnnouncements(orgId, principal.getUserId(), cursor, limit));
    }

    @PostMapping
    public ResponseEntity<OrgAnnouncementResponse.Detail> create(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgAnnouncementRequest.Create request) {
        return ResponseEntity.ok(
                announcementService.create(orgId, principal.getUserId(), request));
    }

    @PutMapping("/{announcementId}")
    public ResponseEntity<OrgAnnouncementResponse.Detail> update(
            @PathVariable String orgId,
            @PathVariable String announcementId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgAnnouncementRequest.Update request) {
        return ResponseEntity.ok(
                announcementService.update(orgId, announcementId, principal.getUserId(), request));
    }

    @DeleteMapping("/{announcementId}")
    public ResponseEntity<Void> delete(
            @PathVariable String orgId,
            @PathVariable String announcementId,
            @AuthenticationPrincipal UserPrincipal principal) {
        announcementService.delete(orgId, announcementId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{announcementId}/pin")
    public ResponseEntity<OrgAnnouncementResponse.Detail> togglePin(
            @PathVariable String orgId,
            @PathVariable String announcementId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                announcementService.togglePin(orgId, announcementId, principal.getUserId()));
    }
}
