package com.kanban.domain.organization.controller;

import com.kanban.domain.organization.leave.dto.LeaveDto;
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
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}/members")
@RequiredArgsConstructor
public class OrgMemberController {

    private final OrgMemberService orgMemberService;

    @GetMapping
    public ResponseEntity<OrgMemberResponse.PageResponse> getMembers(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "department_id", required = false) String departmentId,
            @RequestParam(name = "job_group_id", required = false) String jobGroupId,
            @RequestParam(name = "contract_type", required = false) ContractType contractType,
            @RequestParam(name = "work_status", required = false) WorkStatus workStatus,
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
            @Valid @RequestBody OrgMemberRequest.Update request) {
        OrgMemberResponse.Detail response = orgMemberService.updateMember(
                orgId, memberId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{memberId}/role")
    public ResponseEntity<Void> changeRole(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgMemberRequest.ChangeRole request) {
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

    @GetMapping("/{memberId}/boards")
    public ResponseEntity<List<OrgMemberResponse.MemberBoard>> getMemberBoards(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<OrgMemberResponse.MemberBoard> response = orgMemberService.getMemberBoards(
                orgId, memberId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{memberId}/profile-image")
    public ResponseEntity<OrgMemberResponse.Detail> uploadMemberProfileImage(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestPart("file") MultipartFile file) {
        OrgMemberResponse.Detail response = orgMemberService.uploadMemberProfileImage(
                orgId, memberId, principal.getUserId(), file);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{memberId}/profile-image")
    public ResponseEntity<OrgMemberResponse.Detail> deleteMemberProfileImage(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal) {
        OrgMemberResponse.Detail response = orgMemberService.deleteMemberProfileImage(
                orgId, memberId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{memberId}/concurrent-depts")
    public ResponseEntity<List<OrgMemberResponse.ConcurrentDeptInfo>> updateConcurrentDepts(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgMemberRequest.UpdateConcurrentDepts request) {
        List<OrgMemberResponse.ConcurrentDeptInfo> response = orgMemberService.updateConcurrentDepts(
                orgId, memberId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{memberId}/leave-balances")
    public ResponseEntity<List<LeaveDto.BalanceResponse>> getMemberLeaveBalances(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) Integer year) {
        List<LeaveDto.BalanceResponse> response = orgMemberService.getMemberLeaveBalances(
                orgId, memberId, principal.getUserId(), year);
        return ResponseEntity.ok(response);
    }
}
