package com.kanban.domain.organization.controller;

import com.kanban.domain.organization.dto.OrgMemberHistoryRequest;
import com.kanban.domain.organization.dto.OrgMemberHistoryResponse;
import com.kanban.domain.organization.service.OrgMemberHistoryService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}/members/{memberId}/histories")
@RequiredArgsConstructor
public class OrgMemberHistoryController {

    private final OrgMemberHistoryService historyService;

    @GetMapping
    public ResponseEntity<List<OrgMemberHistoryResponse.Item>> getHistory(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<OrgMemberHistoryResponse.Item> history = historyService.getHistory(
                orgId, memberId, principal.getUserId());
        return ResponseEntity.ok(history);
    }

    @PostMapping
    public ResponseEntity<OrgMemberHistoryResponse.Item> createHistory(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody OrgMemberHistoryRequest.Create request) {
        OrgMemberHistoryResponse.Item result = historyService.createHistory(
                orgId, memberId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    @PatchMapping("/{historyId}/description")
    public ResponseEntity<OrgMemberHistoryResponse.Item> updateDescription(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @PathVariable String historyId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody OrgMemberHistoryRequest.UpdateDescription request) {
        OrgMemberHistoryResponse.Item result = historyService.updateDescription(
                orgId, historyId, principal.getUserId(), request.getDescription());
        return ResponseEntity.ok(result);
    }

    @DeleteMapping("/{historyId}")
    public ResponseEntity<Void> deleteHistory(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @PathVariable String historyId,
            @AuthenticationPrincipal UserPrincipal principal) {
        historyService.deleteHistory(orgId, historyId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }
}
