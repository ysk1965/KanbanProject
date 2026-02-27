package com.kanban.domain.organization.controller;

import com.kanban.domain.organization.dto.OneOnOneRequest;
import com.kanban.domain.organization.dto.OneOnOneResponse;
import com.kanban.domain.organization.service.OrgOneOnOneService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}/one-on-ones")
@RequiredArgsConstructor
public class OrgOneOnOneController {

    private final OrgOneOnOneService oneOnOneService;

    @GetMapping
    public ResponseEntity<List<OneOnOneResponse.Summary>> getOneOnOnes(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(oneOnOneService.getOneOnOnes(orgId, principal.getUserId()));
    }

    @PostMapping
    public ResponseEntity<OneOnOneResponse.Summary> createOneOnOne(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OneOnOneRequest.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(oneOnOneService.createOneOnOne(orgId, principal.getUserId(), request));
    }

    @PutMapping("/{oneOnOneId}")
    public ResponseEntity<OneOnOneResponse.Summary> updateOneOnOne(
            @PathVariable String orgId,
            @PathVariable String oneOnOneId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OneOnOneRequest.Update request) {
        return ResponseEntity.ok(oneOnOneService.updateOneOnOne(orgId, principal.getUserId(), oneOnOneId, request));
    }

    @DeleteMapping("/{oneOnOneId}")
    public ResponseEntity<Void> deleteOneOnOne(
            @PathVariable String orgId,
            @PathVariable String oneOnOneId,
            @AuthenticationPrincipal UserPrincipal principal) {
        oneOnOneService.deleteOneOnOne(orgId, principal.getUserId(), oneOnOneId);
        return ResponseEntity.noContent().build();
    }

    // --- 미팅 노트 ---

    @GetMapping("/{oneOnOneId}/meetings")
    public ResponseEntity<OneOnOneResponse.MeetingListResponse> getMeetings(
            @PathVariable String orgId,
            @PathVariable String oneOnOneId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(oneOnOneService.getMeetings(orgId, principal.getUserId(), oneOnOneId, cursor, size));
    }

    @PostMapping("/{oneOnOneId}/meetings")
    public ResponseEntity<OneOnOneResponse.MeetingDetail> createMeeting(
            @PathVariable String orgId,
            @PathVariable String oneOnOneId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OneOnOneRequest.CreateMeeting request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(oneOnOneService.createMeeting(orgId, principal.getUserId(), oneOnOneId, request));
    }

    @PutMapping("/{oneOnOneId}/meetings/{meetingId}")
    public ResponseEntity<OneOnOneResponse.MeetingDetail> updateMeeting(
            @PathVariable String orgId,
            @PathVariable String oneOnOneId,
            @PathVariable String meetingId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OneOnOneRequest.UpdateMeeting request) {
        return ResponseEntity.ok(oneOnOneService.updateMeeting(orgId, principal.getUserId(), oneOnOneId, meetingId, request));
    }

    @DeleteMapping("/{oneOnOneId}/meetings/{meetingId}")
    public ResponseEntity<Void> deleteMeeting(
            @PathVariable String orgId,
            @PathVariable String oneOnOneId,
            @PathVariable String meetingId,
            @AuthenticationPrincipal UserPrincipal principal) {
        oneOnOneService.deleteMeeting(orgId, principal.getUserId(), oneOnOneId, meetingId);
        return ResponseEntity.noContent().build();
    }

    // --- 액션 아이템 ---

    @PutMapping("/{oneOnOneId}/action-items/{actionId}/toggle")
    public ResponseEntity<OneOnOneResponse.ActionItemDetail> toggleActionItem(
            @PathVariable String orgId,
            @PathVariable String oneOnOneId,
            @PathVariable String actionId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(oneOnOneService.toggleActionItem(orgId, principal.getUserId(), oneOnOneId, actionId));
    }

    @GetMapping("/{oneOnOneId}/action-items/open")
    public ResponseEntity<List<OneOnOneResponse.OpenActionItem>> getOpenActionItems(
            @PathVariable String orgId,
            @PathVariable String oneOnOneId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(oneOnOneService.getOpenActionItems(orgId, principal.getUserId(), oneOnOneId));
    }

    // --- Member-to-Member 조회 ---

    @GetMapping("/by-member/{memberId}")
    public ResponseEntity<OneOnOneResponse.Summary> findByMember(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal) {
        OneOnOneResponse.Summary result = oneOnOneService.findByMembers(orgId, principal.getUserId(), memberId);
        if (result == null) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok(result);
    }
}
