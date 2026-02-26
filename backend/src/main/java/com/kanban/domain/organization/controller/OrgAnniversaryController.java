package com.kanban.domain.organization.controller;

import com.kanban.domain.organization.dto.*;
import com.kanban.domain.organization.service.OrgAnniversaryService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}")
@RequiredArgsConstructor
public class OrgAnniversaryController {

    private final OrgAnniversaryService anniversaryService;

    // ==================== Upcoming Anniversaries ====================

    @GetMapping("/anniversaries/upcoming")
    public ResponseEntity<UpcomingAnniversaryResponse.ListResponse> getUpcomingAnniversaries(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String range) {
        return ResponseEntity.ok(
                anniversaryService.getUpcomingAnniversaries(orgId, principal.getUserId(), range));
    }

    // ==================== Celebration Messages ====================

    @GetMapping("/anniversaries/{memberId}/messages")
    public ResponseEntity<CelebrationMessageResponse.ListResponse> getMessages(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam String type,
            @RequestParam String date,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(
                anniversaryService.getMessages(orgId, memberId, principal.getUserId(),
                        type, date, cursor, size));
    }

    @PostMapping("/anniversaries/{memberId}/messages")
    public ResponseEntity<CelebrationMessageResponse.Detail> createMessage(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CelebrationMessageRequest.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(
                anniversaryService.createMessage(orgId, memberId, principal.getUserId(), request));
    }

    @PutMapping("/anniversaries/{memberId}/messages/{messageId}")
    public ResponseEntity<CelebrationMessageResponse.Detail> updateMessage(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @PathVariable String messageId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CelebrationMessageRequest.Update request) {
        return ResponseEntity.ok(
                anniversaryService.updateMessage(orgId, memberId, messageId,
                        principal.getUserId(), request));
    }

    @DeleteMapping("/anniversaries/{memberId}/messages/{messageId}")
    public ResponseEntity<Void> deleteMessage(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @PathVariable String messageId,
            @AuthenticationPrincipal UserPrincipal principal) {
        anniversaryService.deleteMessage(orgId, memberId, messageId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    // ==================== Anniversary Settings ====================

    @GetMapping("/anniversary-settings")
    public ResponseEntity<AnniversarySettingResponse> getSettings(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                anniversaryService.getSettings(orgId, principal.getUserId()));
    }

    @PutMapping("/anniversary-settings")
    public ResponseEntity<AnniversarySettingResponse> updateSettings(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody AnniversarySettingRequest request) {
        return ResponseEntity.ok(
                anniversaryService.updateSettings(orgId, principal.getUserId(), request));
    }
}
