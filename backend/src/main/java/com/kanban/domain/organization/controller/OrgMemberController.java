package com.kanban.domain.organization.controller;

import com.kanban.domain.organization.ContractType;
import com.kanban.domain.organization.WorkStatus;
import com.kanban.domain.organization.dto.OrgMemberRequest;
import com.kanban.domain.organization.dto.OrgMemberResponse;
import com.kanban.domain.organization.service.OrgMemberService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}/members")
@RequiredArgsConstructor
public class OrgMemberController {

    private final OrgMemberService orgMemberService;

    @GetMapping
    public ResponseEntity<OrgMemberResponse.PageResponse> getMembers(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String departmentId,
            @RequestParam(required = false) String jobGroupId,
            @RequestParam(required = false) ContractType contractType,
            @RequestParam(required = false) WorkStatus workStatus,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20) Pageable pageable) {
        OrgMemberResponse.PageResponse response = orgMemberService.getMembers(
                orgId, principal.getUserId(),
                departmentId, jobGroupId, contractType, workStatus, search, pageable);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{memberId}")
    public ResponseEntity<OrgMemberResponse.Detail> getMember(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal) {
        OrgMemberResponse.Detail response = orgMemberService.getMember(
                orgId, memberId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<OrgMemberResponse.InviteResult> inviteMember(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgMemberRequest.Invite request) {
        OrgMemberResponse.InviteResult response = orgMemberService.inviteMember(
                orgId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{memberId}")
    public ResponseEntity<OrgMemberResponse.Detail> updateMember(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody OrgMemberRequest.Update request) {
        OrgMemberResponse.Detail response = orgMemberService.updateMember(
                orgId, memberId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{memberId}/role")
    public ResponseEntity<Void> changeRole(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody OrgMemberRequest.ChangeRole request) {
        orgMemberService.changeRole(orgId, memberId, principal.getUserId(), request);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{memberId}")
    public ResponseEntity<OrgMemberResponse.RemoveResult> removeMember(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal) {
        OrgMemberResponse.RemoveResult response = orgMemberService.removeMember(
                orgId, memberId, principal.getUserId());
        return ResponseEntity.ok(response);
    }
}
