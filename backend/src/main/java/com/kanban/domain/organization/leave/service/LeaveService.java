package com.kanban.domain.organization.leave.service;

import com.kanban.domain.organization.leave.*;
import com.kanban.domain.organization.leave.dto.LeaveDto;
import com.kanban.domain.organization.leave.repository.LeaveBalanceRepository;
import com.kanban.domain.organization.leave.repository.LeavePolicyRepository;
import com.kanban.domain.organization.leave.repository.LeaveRequestRepository;
import com.kanban.domain.organization.OrgActivityType;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.OrganizationMember;
import com.kanban.domain.organization.WorkStatus;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.organization.service.OrgActivityService;
import com.kanban.domain.organization.service.OrganizationService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class LeaveService {

    private final LeavePolicyRepository leavePolicyRepository;
    private final LeaveBalanceRepository leaveBalanceRepository;
    private final LeaveRequestRepository leaveRequestRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final OrganizationService organizationService;
    private final OrgActivityService orgActivityService;

    // ==================== Leave Policy ====================

    @Transactional
    public List<LeaveDto.PolicyResponse> getPolicies(String orgId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);
        List<LeavePolicy> policies = leavePolicyRepository.findByOrganizationId(orgId);
        if (policies.isEmpty()) {
            Organization org = organizationService.getActiveOrgOrThrow(orgId);
            createDefaultPolicies(org);
            policies = leavePolicyRepository.findByOrganizationId(orgId);
            log.info("Auto-created default leave policies for org: {}", orgId);
        }
        return policies.stream()
                .map(LeaveDto.PolicyResponse::of)
                .collect(Collectors.toList());
    }

    @Transactional
    public LeaveDto.PolicyResponse createPolicy(String orgId, String userId, LeaveDto.CreatePolicy request) {
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        LeavePolicy policy = LeavePolicy.builder()
                .organization(org)
                .name(request.getName())
                .leaveCategory(request.getLeaveCategory())
                .defaultDays(request.getDefaultDays() != null ? request.getDefaultDays() : BigDecimal.ZERO)
                .isPaid(request.getIsPaid() != null ? request.getIsPaid() : true)
                .requiresApproval(request.getRequiresApproval() != null ? request.getRequiresApproval() : true)
                .description(request.getDescription())
                .build();
        leavePolicyRepository.save(policy);

        // Auto-create balance for all active members
        int year = LocalDate.now(ZoneOffset.UTC).getYear();
        List<OrganizationMember> activeMembers = orgMemberRepository.findActiveMembers(orgId,
                Arrays.asList(WorkStatus.ACTIVE, WorkStatus.ON_LEAVE));
        for (OrganizationMember member : activeMembers) {
            if (!leaveBalanceRepository.existsByMemberIdAndPolicyIdAndYear(member.getId(), policy.getId(), year)) {
                LeaveBalance balance = LeaveBalance.builder()
                        .organization(org)
                        .member(member)
                        .policy(policy)
                        .year(year)
                        .totalDays(policy.getDefaultDays())
                        .build();
                leaveBalanceRepository.save(balance);
            }
        }

        log.info("Leave policy created: orgId={}, policyId={}, balancesCreated={}", orgId, policy.getId(), activeMembers.size());
        return LeaveDto.PolicyResponse.of(policy);
    }

    @Transactional
    public LeaveDto.PolicyResponse updatePolicy(String orgId, String policyId, String userId, LeaveDto.UpdatePolicy request) {
        organizationService.checkAdminOrAbove(orgId, userId);

        LeavePolicy policy = leavePolicyRepository.findByIdAndOrganizationId(policyId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.LEAVE_POLICY_NOT_FOUND));

        // Check if deactivating
        if (request.getIsActive() != null && !request.getIsActive() && policy.getIsActive()) {
            // Cancel all PENDING requests for this policy
            List<LeaveRequest> pendingRequests = leaveRequestRepository.findByPolicyIdAndStatus(policyId, LeaveStatus.PENDING);
            for (LeaveRequest lr : pendingRequests) {
                lr.cancel();
            }
            policy.deactivate();
            log.info("Leave policy deactivated: policyId={}, canceledRequests={}", policyId, pendingRequests.size());
        } else if (request.getIsActive() != null && request.getIsActive()) {
            policy.activate();
        }

        policy.updateInfo(request.getName(), request.getDefaultDays(), request.getIsPaid(),
                request.getRequiresApproval(), request.getDescription());

        return LeaveDto.PolicyResponse.of(policy);
    }

    // ==================== Leave Balance ====================

    public List<LeaveDto.BalanceResponse> getMyBalance(String orgId, String userId) {
        OrganizationMember member = organizationService.getOrgMemberOrThrow(orgId, userId);
        int year = LocalDate.now(ZoneOffset.UTC).getYear();
        return leaveBalanceRepository.findByOrgIdAndMemberIdAndYear(orgId, member.getId(), year).stream()
                .map(LeaveDto.BalanceResponse::of)
                .collect(Collectors.toList());
    }

    public List<LeaveDto.BalanceResponse> getMemberBalance(String orgId, String memberId, String userId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        OrganizationMember member = orgMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!member.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }
        int year = LocalDate.now(ZoneOffset.UTC).getYear();
        return leaveBalanceRepository.findByOrgIdAndMemberIdAndYear(orgId, memberId, year).stream()
                .map(LeaveDto.BalanceResponse::of)
                .collect(Collectors.toList());
    }

    @Transactional
    public LeaveDto.BalanceResponse updateMemberBalance(String orgId, String memberId, String balanceId,
            String userId, LeaveDto.UpdateBalance request) {
        organizationService.checkAdminOrAbove(orgId, userId);
        LeaveBalance balance = leaveBalanceRepository.findById(balanceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.LEAVE_BALANCE_NOT_FOUND));
        if (!balance.getOrganization().getId().equals(orgId) || !balance.getMember().getId().equals(memberId)) {
            throw new BusinessException(ErrorCode.LEAVE_BALANCE_NOT_FOUND);
        }
        balance.updateTotalDays(request.getTotalDays());
        log.info("Leave balance adjusted: balanceId={}, newTotal={}, by={}", balanceId, request.getTotalDays(), userId);
        return LeaveDto.BalanceResponse.of(balance);
    }

    // ==================== Leave Requests ====================

    @Transactional
    public LeaveDto.LeaveRequestResponse createLeaveRequest(String orgId, String userId, LeaveDto.CreateLeaveRequest request) {
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        OrganizationMember member = organizationService.getOrgMemberOrThrow(orgId, userId);

        LeavePolicy policy = leavePolicyRepository.findByIdAndOrganizationId(request.getPolicyId(), orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.LEAVE_POLICY_NOT_FOUND));

        if (!policy.getIsActive()) {
            throw new BusinessException(ErrorCode.LEAVE_POLICY_INACTIVE);
        }

        LeaveDurationType durationType = request.getDurationType() != null ? request.getDurationType() : LeaveDurationType.FULL_DAY;

        // Half-day must be single date
        if (durationType != LeaveDurationType.FULL_DAY && !request.getStartDate().equals(request.getEndDate())) {
            throw new BusinessException(ErrorCode.LEAVE_HALF_DAY_MULTI_DATE);
        }

        // Calculate total_days
        BigDecimal totalDays;
        if (durationType == LeaveDurationType.FULL_DAY) {
            long dayCount = ChronoUnit.DAYS.between(request.getStartDate(), request.getEndDate()) + 1;
            totalDays = BigDecimal.valueOf(dayCount);
        } else {
            totalDays = new BigDecimal("0.5");
        }

        // Check overlap
        List<LeaveStatus> activeStatuses = Arrays.asList(LeaveStatus.PENDING, LeaveStatus.APPROVED);
        List<LeaveRequest> overlapping = leaveRequestRepository.findOverlapping(
                member.getId(), request.getStartDate(), request.getEndDate(), activeStatuses);

        for (LeaveRequest existing : overlapping) {
            if (durationType == LeaveDurationType.FULL_DAY || existing.getDurationType() == LeaveDurationType.FULL_DAY) {
                throw new BusinessException(ErrorCode.LEAVE_OVERLAP_EXISTS);
            }
            if (durationType == existing.getDurationType()) {
                throw new BusinessException(ErrorCode.LEAVE_OVERLAP_EXISTS);
            }
            // AM_HALF + PM_HALF is allowed
        }

        // Check balance
        int year = request.getStartDate().getYear();
        LeaveBalance balance = leaveBalanceRepository
                .findByMemberIdAndPolicyIdAndYear(member.getId(), policy.getId(), year)
                .orElse(null);
        if (balance != null && !balance.hasEnough(totalDays)) {
            throw new BusinessException(ErrorCode.LEAVE_INSUFFICIENT_BALANCE);
        }

        LeaveRequest leaveRequest = LeaveRequest.builder()
                .organization(org)
                .requester(member)
                .policy(policy)
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .durationType(durationType)
                .totalDays(totalDays)
                .reason(request.getReason())
                .build();
        leaveRequestRepository.save(leaveRequest);

        return LeaveDto.LeaveRequestResponse.of(leaveRequest);
    }

    public LeaveDto.LeaveRequestPageResponse getLeaveRequests(String orgId, String userId,
            LeaveStatus status, String requesterId, LocalDate startDate, LocalDate endDate, Pageable pageable) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        Page<LeaveRequest> page = leaveRequestRepository.findByOrgIdWithFilters(
                orgId, status, requesterId, startDate, endDate, pageable);

        List<LeaveDto.LeaveRequestResponse> content = page.getContent().stream()
                .map(LeaveDto.LeaveRequestResponse::of)
                .collect(Collectors.toList());

        return LeaveDto.LeaveRequestPageResponse.builder()
                .content(content)
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .page(page.getNumber())
                .size(page.getSize())
                .build();
    }

    @Transactional
    public LeaveDto.LeaveRequestResponse approveLeaveRequest(String orgId, String requestId, String userId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        OrganizationMember reviewer = organizationService.getOrgMemberOrThrow(orgId, userId);

        LeaveRequest leaveRequest = leaveRequestRepository.findByIdAndOrganizationId(requestId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.LEAVE_REQUEST_NOT_FOUND));

        if (!leaveRequest.isPending()) {
            throw new BusinessException(ErrorCode.LEAVE_CANNOT_APPROVE);
        }

        // Pessimistic lock on balance for concurrent approval safety
        int year = leaveRequest.getStartDate().getYear();
        LeaveBalance balance = leaveBalanceRepository
                .findByMemberIdAndPolicyIdAndYearForUpdate(
                        leaveRequest.getRequester().getId(),
                        leaveRequest.getPolicy().getId(),
                        year)
                .orElse(null);

        if (balance != null) {
            if (!balance.hasEnough(leaveRequest.getTotalDays())) {
                throw new BusinessException(ErrorCode.LEAVE_INSUFFICIENT_BALANCE);
            }
            balance.consumeDays(leaveRequest.getTotalDays());
        }

        leaveRequest.approve(reviewer);

        // Log activity
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        String requesterName = leaveRequest.getRequester() != null
                ? leaveRequest.getRequester().getUser().getName() : "Unknown";
        orgActivityService.log(org, reviewer.getUser().getName(),
                OrgActivityType.LEAVE_APPROVED, requesterName, null);

        return LeaveDto.LeaveRequestResponse.of(leaveRequest);
    }

    @Transactional
    public LeaveDto.LeaveRequestResponse rejectLeaveRequest(String orgId, String requestId, String userId,
            LeaveDto.RejectLeaveRequest request) {
        organizationService.checkAdminOrAbove(orgId, userId);
        OrganizationMember reviewer = organizationService.getOrgMemberOrThrow(orgId, userId);

        LeaveRequest leaveRequest = leaveRequestRepository.findByIdAndOrganizationId(requestId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.LEAVE_REQUEST_NOT_FOUND));

        if (!leaveRequest.isPending()) {
            throw new BusinessException(ErrorCode.LEAVE_CANNOT_REJECT);
        }

        leaveRequest.reject(reviewer, request != null ? request.getComment() : null);

        // Log activity
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        String requesterName = leaveRequest.getRequester() != null
                ? leaveRequest.getRequester().getUser().getName() : "Unknown";
        orgActivityService.log(org, reviewer.getUser().getName(),
                OrgActivityType.LEAVE_REJECTED, requesterName, null);

        return LeaveDto.LeaveRequestResponse.of(leaveRequest);
    }

    @Transactional
    public LeaveDto.LeaveRequestResponse cancelLeaveRequest(String orgId, String requestId, String userId) {
        OrganizationMember member = organizationService.getOrgMemberOrThrow(orgId, userId);

        LeaveRequest leaveRequest = leaveRequestRepository.findByIdAndOrganizationId(requestId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.LEAVE_REQUEST_NOT_FOUND));

        // Only requester or admin can cancel
        boolean isRequester = leaveRequest.getRequester() != null
                && leaveRequest.getRequester().getUser().getId().equals(userId);
        if (!isRequester && !member.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.LEAVE_CANNOT_CANCEL);
        }

        if (leaveRequest.isPending()) {
            leaveRequest.cancel();
        } else if (leaveRequest.isApproved()) {
            if (!leaveRequest.canCancelAfterApproval()) {
                throw new BusinessException(ErrorCode.LEAVE_CANCEL_PAST_NOT_ALLOWED);
            }
            // Restore balance
            int year = leaveRequest.getStartDate().getYear();
            LeaveBalance balance = leaveBalanceRepository
                    .findByMemberIdAndPolicyIdAndYearForUpdate(
                            leaveRequest.getRequester().getId(),
                            leaveRequest.getPolicy().getId(),
                            year)
                    .orElse(null);
            if (balance != null) {
                balance.restoreDays(leaveRequest.getTotalDays());
            }
            leaveRequest.cancel();
        } else {
            throw new BusinessException(ErrorCode.LEAVE_CANNOT_CANCEL);
        }

        return LeaveDto.LeaveRequestResponse.of(leaveRequest);
    }

    @Transactional
    public LeaveDto.LeaveRequestResponse reopenLeaveRequest(String orgId, String requestId, String userId) {
        OrganizationMember member = organizationService.getOrgMemberOrThrow(orgId, userId);

        LeaveRequest leaveRequest = leaveRequestRepository.findByIdAndOrganizationId(requestId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.LEAVE_REQUEST_NOT_FOUND));

        if (!leaveRequest.isCanceled()) {
            throw new BusinessException(ErrorCode.LEAVE_CANNOT_REOPEN);
        }

        // Only requester or admin can reopen
        boolean isRequester = leaveRequest.getRequester() != null
                && leaveRequest.getRequester().getUser().getId().equals(userId);
        if (!isRequester && !member.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.LEAVE_CANNOT_REOPEN);
        }

        // Check policy is still active
        if (!leaveRequest.getPolicy().getIsActive()) {
            throw new BusinessException(ErrorCode.LEAVE_POLICY_INACTIVE);
        }

        // Check overlap with existing active requests
        List<LeaveStatus> activeStatuses = Arrays.asList(LeaveStatus.PENDING, LeaveStatus.APPROVED);
        List<LeaveRequest> overlapping = leaveRequestRepository.findOverlapping(
                leaveRequest.getRequester().getId(), leaveRequest.getStartDate(), leaveRequest.getEndDate(), activeStatuses);
        if (!overlapping.isEmpty()) {
            throw new BusinessException(ErrorCode.LEAVE_OVERLAP_EXISTS);
        }

        // Check balance
        int year = leaveRequest.getStartDate().getYear();
        LeaveBalance balance = leaveBalanceRepository
                .findByMemberIdAndPolicyIdAndYear(leaveRequest.getRequester().getId(),
                        leaveRequest.getPolicy().getId(), year)
                .orElse(null);
        if (balance != null && !balance.hasEnough(leaveRequest.getTotalDays())) {
            throw new BusinessException(ErrorCode.LEAVE_INSUFFICIENT_BALANCE);
        }

        leaveRequest.reopen();

        return LeaveDto.LeaveRequestResponse.of(leaveRequest);
    }

    // ==================== On Leave Today ====================

    public List<LeaveDto.LeaveRequestResponse> getOnLeaveToday(String orgId, String userId, LocalDate date) {
        organizationService.getOrgMemberOrThrow(orgId, userId);
        LocalDate targetDate = date != null ? date : LocalDate.now(ZoneOffset.UTC);
        return leaveRequestRepository.findApprovedOnDate(orgId, targetDate).stream()
                .map(LeaveDto.LeaveRequestResponse::of)
                .collect(Collectors.toList());
    }

    // ==================== Helper: Create default policies ====================

    @Transactional
    public void createDefaultPolicies(Organization org) {
        createDefaultPolicy(org, "연차", LeaveCategory.ANNUAL, new BigDecimal("15.0"), 0);
        createDefaultPolicy(org, "병가", LeaveCategory.SICK, new BigDecimal("10.0"), 1);
        createDefaultPolicy(org, "리프레시 휴가", LeaveCategory.REFRESH, new BigDecimal("5.0"), 2);
        createDefaultPolicy(org, "기타", LeaveCategory.OTHER, BigDecimal.ZERO, 3);
    }

    private void createDefaultPolicy(Organization org, String name, LeaveCategory category,
                                     BigDecimal defaultDays, int order) {
        LeavePolicy policy = LeavePolicy.builder()
                .organization(org)
                .name(name)
                .leaveCategory(category)
                .defaultDays(defaultDays)
                .displayOrder(order)
                .build();
        leavePolicyRepository.save(policy);
    }

    @Transactional
    public void createBalancesForNewMember(Organization org, OrganizationMember member) {
        int year = LocalDate.now(ZoneOffset.UTC).getYear();
        List<LeavePolicy> activePolicies = leavePolicyRepository.findActiveByOrganizationId(org.getId());
        for (LeavePolicy policy : activePolicies) {
            if (!leaveBalanceRepository.existsByMemberIdAndPolicyIdAndYear(member.getId(), policy.getId(), year)) {
                LeaveBalance balance = LeaveBalance.builder()
                        .organization(org)
                        .member(member)
                        .policy(policy)
                        .year(year)
                        .totalDays(policy.getDefaultDays())
                        .build();
                leaveBalanceRepository.save(balance);
            }
        }
    }
}
