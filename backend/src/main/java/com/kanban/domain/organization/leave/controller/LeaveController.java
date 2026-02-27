package com.kanban.domain.organization.leave.controller;

import com.kanban.domain.organization.leave.LeaveStatus;
import com.kanban.domain.organization.leave.dto.LeaveDto;
import com.kanban.domain.organization.leave.service.LeaveService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}")
@RequiredArgsConstructor
public class LeaveController {

    private final LeaveService leaveService;

    // ==================== Leave Policies ====================

    @GetMapping("/leave-policies")
    public ResponseEntity<List<LeaveDto.PolicyResponse>> getPolicies(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<LeaveDto.PolicyResponse> response = leaveService.getPolicies(orgId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/leave-policies")
    public ResponseEntity<LeaveDto.PolicyResponse> createPolicy(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody LeaveDto.CreatePolicy request) {
        LeaveDto.PolicyResponse response = leaveService.createPolicy(orgId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/leave-policies/{policyId}")
    public ResponseEntity<LeaveDto.PolicyResponse> updatePolicy(
            @PathVariable String orgId,
            @PathVariable String policyId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody LeaveDto.UpdatePolicy request) {
        LeaveDto.PolicyResponse response = leaveService.updatePolicy(orgId, policyId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    // ==================== Leave Balances ====================

    @GetMapping("/my-leave-balance")
    public ResponseEntity<List<LeaveDto.BalanceResponse>> getMyBalance(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<LeaveDto.BalanceResponse> response = leaveService.getMyBalance(orgId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/members/{memberId}/leave-balance")
    public ResponseEntity<List<LeaveDto.BalanceResponse>> getMemberBalance(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<LeaveDto.BalanceResponse> response = leaveService.getMemberBalance(
                orgId, memberId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PutMapping("/members/{memberId}/leave-balance/{balanceId}")
    public ResponseEntity<LeaveDto.BalanceResponse> updateMemberBalance(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @PathVariable String balanceId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody LeaveDto.UpdateBalance request) {
        LeaveDto.BalanceResponse response = leaveService.updateMemberBalance(
                orgId, memberId, balanceId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/members/{memberId}/leave-balance/{balanceId}/adjust")
    public ResponseEntity<LeaveDto.BalanceResponse> adjustMemberBalance(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @PathVariable String balanceId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody LeaveDto.AdjustBalance request) {
        LeaveDto.BalanceResponse response = leaveService.adjustMemberBalance(
                orgId, memberId, balanceId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    // ==================== Leave Adjustments (History) ====================

    @GetMapping("/members/{memberId}/leave-adjustments")
    public ResponseEntity<LeaveDto.AdjustmentPageResponse> getMemberAdjustments(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        LeaveDto.AdjustmentPageResponse response = leaveService.getMemberAdjustments(
                orgId, memberId, principal.getUserId(), pageable);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/leave-adjustments")
    public ResponseEntity<LeaveDto.AdjustmentPageResponse> getOrgAdjustments(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        LeaveDto.AdjustmentPageResponse response = leaveService.getOrgAdjustments(
                orgId, principal.getUserId(), pageable);
        return ResponseEntity.ok(response);
    }

    // ==================== On Leave Today ====================

    @GetMapping("/on-leave-today")
    public ResponseEntity<List<LeaveDto.LeaveRequestResponse>> getOnLeaveToday(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        List<LeaveDto.LeaveRequestResponse> response = leaveService.getOnLeaveToday(
                orgId, principal.getUserId(), date);
        return ResponseEntity.ok(response);
    }

    // ==================== Leave Requests ====================

    @PostMapping("/leave-requests")
    public ResponseEntity<LeaveDto.LeaveRequestResponse> createLeaveRequest(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody LeaveDto.CreateLeaveRequest request) {
        LeaveDto.LeaveRequestResponse response = leaveService.createLeaveRequest(
                orgId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/leave-requests")
    public ResponseEntity<LeaveDto.LeaveRequestPageResponse> getLeaveRequests(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) LeaveStatus status,
            @RequestParam(name = "requester_id", required = false) String requesterId,
            @RequestParam(name = "start_date", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(name = "end_date", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        LeaveDto.LeaveRequestPageResponse response = leaveService.getLeaveRequests(
                orgId, principal.getUserId(), status, requesterId, startDate, endDate, pageable);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/leave-requests/{requestId}/approve")
    public ResponseEntity<LeaveDto.LeaveRequestResponse> approveLeaveRequest(
            @PathVariable String orgId,
            @PathVariable String requestId,
            @AuthenticationPrincipal UserPrincipal principal) {
        LeaveDto.LeaveRequestResponse response = leaveService.approveLeaveRequest(
                orgId, requestId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PutMapping("/leave-requests/{requestId}/reject")
    public ResponseEntity<LeaveDto.LeaveRequestResponse> rejectLeaveRequest(
            @PathVariable String orgId,
            @PathVariable String requestId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody(required = false) LeaveDto.RejectLeaveRequest request) {
        LeaveDto.LeaveRequestResponse response = leaveService.rejectLeaveRequest(
                orgId, requestId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/leave-requests/{requestId}/cancel")
    public ResponseEntity<LeaveDto.LeaveRequestResponse> cancelLeaveRequest(
            @PathVariable String orgId,
            @PathVariable String requestId,
            @AuthenticationPrincipal UserPrincipal principal) {
        LeaveDto.LeaveRequestResponse response = leaveService.cancelLeaveRequest(
                orgId, requestId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PutMapping("/leave-requests/{requestId}/reopen")
    public ResponseEntity<LeaveDto.LeaveRequestResponse> reopenLeaveRequest(
            @PathVariable String orgId,
            @PathVariable String requestId,
            @AuthenticationPrincipal UserPrincipal principal) {
        LeaveDto.LeaveRequestResponse response = leaveService.reopenLeaveRequest(
                orgId, requestId, principal.getUserId());
        return ResponseEntity.ok(response);
    }
}
