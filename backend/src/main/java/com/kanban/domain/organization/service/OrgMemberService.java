package com.kanban.domain.organization.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.organization.leave.LeaveRequest;
import com.kanban.domain.organization.leave.LeaveStatus;
import com.kanban.domain.organization.leave.dto.LeaveDto;
import com.kanban.domain.organization.leave.repository.LeaveBalanceRepository;
import com.kanban.domain.organization.leave.repository.LeaveRequestRepository;
import com.kanban.domain.organization.leave.service.LeaveService;
import com.kanban.domain.organization.*;
import com.kanban.domain.organization.dto.OrgMemberRequest;
import com.kanban.domain.organization.dto.OrgMemberResponse;
import com.kanban.domain.organization.repository.*;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.domain.user.service.UserService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashMap;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgMemberService {

    private final OrgMemberRepository orgMemberRepository;
    private final OrgDepartmentRepository orgDepartmentRepository;
    private final OrgJobGroupRepository orgJobGroupRepository;
    private final OrgPositionRepository orgPositionRepository;
    private final OrgTitleRepository orgTitleRepository;
    private final OrgGradeRepository orgGradeRepository;
    private final OrgMemberConcurrentDeptRepository orgMemberConcurrentDeptRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final UserRepository userRepository;
    private final UserService userService;
    private final OrganizationService organizationService;
    private final OrgActivityService orgActivityService;
    private final LeaveService leaveService;
    private final LeaveRequestRepository leaveRequestRepository;
    private final LeaveBalanceRepository leaveBalanceRepository;
    private final OrgOnboardingService onboardingService;
    private final OrgMemberHistoryService orgMemberHistoryService;

    public OrgMemberResponse.PageResponse getMembers(String orgId, String userId,
            String departmentId, String jobGroupId, ContractType contractType,
            WorkStatus workStatus, String search, Pageable pageable) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        Page<OrganizationMember> page = orgMemberRepository.findByOrgIdWithFilters(
                orgId, departmentId, jobGroupId, contractType, workStatus, search, pageable);

        List<OrgMemberResponse.Simple> content = page.getContent().stream()
                .map(OrgMemberResponse.Simple::of)
                .collect(Collectors.toList());

        return OrgMemberResponse.PageResponse.builder()
                .content(content)
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .page(page.getNumber())
                .size(page.getSize())
                .build();
    }

    public OrgMemberResponse.Detail getMember(String orgId, String memberId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);
        OrganizationMember member = orgMemberRepository.findByIdWithDetails(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!member.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        List<OrgMemberResponse.ConcurrentDeptInfo> concurrentDepts =
                orgMemberConcurrentDeptRepository.findByMemberId(memberId).stream()
                        .map(OrgMemberResponse.ConcurrentDeptInfo::of)
                        .collect(Collectors.toList());

        return OrgMemberResponse.Detail.of(member, concurrentDepts);
    }

    @Transactional
    public OrgMemberResponse.InviteResult inviteMember(String orgId, String userId, OrgMemberRequest.Invite request) {
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        User inviter = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // Find user by email
        User targetUser = userRepository.findByEmail(request.getEmail()).orElse(null);

        if (targetUser != null) {
            // Check if already a member
            if (orgMemberRepository.existsByOrganizationIdAndUserId(orgId, targetUser.getId())) {
                throw new BusinessException(ErrorCode.ORG_MEMBER_ALREADY_EXISTS);
            }

            // Resolve department
            OrganizationDepartment dept = null;
            if (request.getDepartmentId() != null) {
                dept = orgDepartmentRepository.findByIdAndOrganizationId(request.getDepartmentId(), orgId)
                        .orElse(null);
            }

            OrgRole role = request.getRole() != null ? request.getRole() : OrgRole.MEMBER;
            if (role == OrgRole.OWNER) {
                role = OrgRole.MEMBER; // Cannot invite as OWNER
            }

            OrganizationMember newMember = OrganizationMember.builder()
                    .organization(org)
                    .user(targetUser)
                    .role(role)
                    .department(dept)
                    .jobTitle(request.getJobTitle())
                    .invitedBy(inviter)
                    .build();
            orgMemberRepository.save(newMember);

            // Create leave balances for new member
            leaveService.createBalancesForNewMember(org, newMember);

            // Auto-assign onboarding checklists
            onboardingService.autoAssignOnboarding(org, newMember);

            // Log activity
            orgActivityService.log(org, inviter.getName(),
                    OrgActivityType.MEMBER_JOINED, targetUser.getName(), null);

            return OrgMemberResponse.InviteResult.builder()
                    .type("direct_add")
                    .member(OrgMemberResponse.Simple.of(newMember))
                    .build();
        } else {
            // User not found - for now return email_sent (actual email logic in future)
            OrgRole role = request.getRole() != null ? request.getRole() : OrgRole.MEMBER;
            return OrgMemberResponse.InviteResult.builder()
                    .type("email_sent")
                    .email(request.getEmail())
                    .role(role)
                    .build();
        }
    }

    @Transactional
    public OrgMemberResponse.Detail updateMember(String orgId, String memberId, String userId,
            OrgMemberRequest.Update request) {
        organizationService.getActiveOrgOrThrow(orgId);
        OrganizationMember requester = organizationService.getOrgMemberOrThrow(orgId, userId);
        OrganizationMember target = orgMemberRepository.findByIdWithDetails(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        if (!target.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        boolean isSelf = requester.getId().equals(target.getId());
        boolean isAdmin = requester.isAdminOrAbove();

        if (!isSelf && !isAdmin) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }

        // Capture HR snapshot before mutations (for history tracking)
        OrgMemberHistoryService.HrSnapshot beforeSnapshot = OrgMemberHistoryService.HrSnapshot.of(target);

        // Resolve department and job group
        OrganizationDepartment dept = target.getDepartment();
        OrganizationJobGroup jobGroup = target.getJobGroup();

        if (isAdmin && request.getDepartmentId() != null) {
            dept = orgDepartmentRepository.findByIdAndOrganizationId(request.getDepartmentId(), orgId)
                    .orElse(null);
            target.updateDepartment(dept);
        }

        if (isAdmin && request.getJobGroupId() != null) {
            jobGroup = orgJobGroupRepository.findByIdAndOrganizationId(request.getJobGroupId(), orgId)
                    .orElse(null);
            target.updateJobGroup(jobGroup);
        }

        if (isAdmin && request.getPositionId() != null) {
            OrganizationPosition position = request.getPositionId().isEmpty() ? null :
                    orgPositionRepository.findByIdAndOrganizationId(request.getPositionId(), orgId).orElse(null);
            target.updatePosition(position);
        }

        if (isAdmin && request.getTitleId() != null) {
            OrganizationTitle title = request.getTitleId().isEmpty() ? null :
                    orgTitleRepository.findByIdAndOrganizationId(request.getTitleId(), orgId).orElse(null);
            target.updateTitle(title);
        }

        if (isAdmin && request.getGradeId() != null) {
            OrganizationGrade grade = request.getGradeId().isEmpty() ? null :
                    orgGradeRepository.findByIdAndOrganizationId(request.getGradeId(), orgId).orElse(null);
            target.updateGrade(grade);
        }

        // Admin-only fields
        ContractType contractType = isAdmin ? request.getContractType() : null;
        WorkStatus workStatus = isAdmin ? request.getWorkStatus() : null;
        String employeeId = isAdmin ? request.getEmployeeId() : null;
        LocalDate hireDate = isAdmin ? request.getHireDate() : target.getHireDate();

        target.updateInfo(
                request.getJobTitle(),
                contractType,
                workStatus,
                employeeId,
                request.getPhone(),
                request.getBirthDate(),
                hireDate,
                request.getBio()
        );

        // Record history if HR fields changed
        OrgMemberHistoryService.HrSnapshot afterSnapshot = OrgMemberHistoryService.HrSnapshot.of(target);
        orgMemberHistoryService.recordChangeIfNeeded(target, beforeSnapshot, afterSnapshot, requester.getId());

        List<OrgMemberResponse.ConcurrentDeptInfo> concurrentDepts =
                orgMemberConcurrentDeptRepository.findByMemberId(memberId).stream()
                        .map(OrgMemberResponse.ConcurrentDeptInfo::of)
                        .collect(Collectors.toList());

        return OrgMemberResponse.Detail.of(target, concurrentDepts);
    }

    @Transactional
    public void changeRole(String orgId, String memberId, String userId, OrgMemberRequest.ChangeRole request) {
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        OrganizationMember requester = organizationService.getOrgMemberOrThrow(orgId, userId);
        if (!requester.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }

        OrganizationMember target = orgMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        if (!target.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        if (target.isOwner()) {
            throw new BusinessException(ErrorCode.CANNOT_CHANGE_ORG_OWNER_ROLE);
        }

        if (request.getRole() == OrgRole.OWNER) {
            throw new BusinessException(ErrorCode.CANNOT_CHANGE_ORG_OWNER_ROLE);
        }
        String oldRole = target.getRole().name();
        target.updateRole(request.getRole());

        // Log activity
        Map<String, Object> meta = new HashMap<>();
        meta.put("old_role", oldRole);
        meta.put("new_role", request.getRole().name());
        orgActivityService.log(org, requester.getUser().getName(),
                OrgActivityType.MEMBER_ROLE_CHANGED, target.getUser().getName(), meta);
    }

    @Transactional
    public OrgMemberResponse.RemoveResult removeMember(String orgId, String memberId, String userId) {
        organizationService.getActiveOrgOrThrow(orgId);
        OrganizationMember requester = organizationService.getOrgMemberOrThrow(orgId, userId);
        OrganizationMember target = orgMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        if (!target.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        // Cannot remove OWNER
        if (target.isOwner()) {
            throw new BusinessException(ErrorCode.CANNOT_REMOVE_ORG_OWNER);
        }

        // Self-removal is allowed, otherwise Admin+ required
        boolean isSelf = requester.getId().equals(target.getId());
        if (!isSelf && !requester.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }

        // R3: Check if target is Board Owner of any org board & collect board info in single pass
        List<Board> orgBoards = boardRepository.findByOrganizationId(orgId);
        List<OrgMemberResponse.RemovedBoardInfo> removedBoards = new ArrayList<>();
        for (Board board : orgBoards) {
            if (board.getOwner().getId().equals(target.getUser().getId())) {
                throw new BusinessException(ErrorCode.CANNOT_REMOVE_BOARD_OWNER_FROM_ORG);
            }
            BoardMember boardMember = boardMemberRepository
                    .findByBoardIdAndUserId(board.getId(), target.getUser().getId())
                    .orElse(null);
            if (boardMember != null) {
                boardMemberRepository.delete(boardMember);
                removedBoards.add(OrgMemberResponse.RemovedBoardInfo.builder()
                        .boardId(board.getId())
                        .boardName(board.getName())
                        .build());
            }
        }

        // Remove concurrent dept assignments
        orgMemberConcurrentDeptRepository.deleteByMemberId(target.getId());

        // Cancel PENDING leave requests for the member being removed
        List<LeaveRequest> pendingLeaves = leaveRequestRepository.findByRequesterIdAndStatus(
                target.getId(), LeaveStatus.PENDING);
        for (LeaveRequest lr : pendingLeaves) {
            lr.cancel();
        }

        String memberName = target.getUser().getName();
        Organization org = organizationService.getActiveOrgOrThrow(orgId);

        // Log activity before deletion
        orgActivityService.log(org, requester.getUser().getName(),
                OrgActivityType.MEMBER_LEFT, memberName, null);

        // Delete the org member (leave_balances ON DELETE CASCADE)
        orgMemberRepository.delete(target);

        log.info("Organization member removed: orgId={}, memberId={}, removedFromBoards={}",
                orgId, memberId, removedBoards.size());

        return OrgMemberResponse.RemoveResult.builder()
                .removedMember(OrgMemberResponse.RemovedMemberInfo.builder()
                        .id(memberId)
                        .name(memberName)
                        .build())
                .cascadeRemovedFromBoards(removedBoards)
                .build();
    }

    @Transactional
    public List<OrgMemberResponse.ConcurrentDeptInfo> updateConcurrentDepts(String orgId, String memberId,
            String userId, OrgMemberRequest.UpdateConcurrentDepts request) {
        organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        OrganizationMember target = orgMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!target.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        Organization org = organizationService.getActiveOrgOrThrow(orgId);

        // Delete existing concurrent depts and recreate
        orgMemberConcurrentDeptRepository.deleteByMemberId(memberId);

        List<OrgMemberResponse.ConcurrentDeptInfo> result = new ArrayList<>();
        if (request.getConcurrentDepts() != null) {
            for (OrgMemberRequest.ConcurrentDeptItem item : request.getConcurrentDepts()) {
                OrganizationDepartment dept = orgDepartmentRepository
                        .findByIdAndOrganizationId(item.getDepartmentId(), orgId)
                        .orElse(null);
                if (dept == null) continue;

                OrganizationPosition position = null;
                if (item.getPositionId() != null && !item.getPositionId().isEmpty()) {
                    position = orgPositionRepository
                            .findByIdAndOrganizationId(item.getPositionId(), orgId)
                            .orElse(null);
                }

                OrganizationMemberConcurrentDept cd = OrganizationMemberConcurrentDept.builder()
                        .organization(org)
                        .member(target)
                        .department(dept)
                        .position(position)
                        .displayOrder(item.getDisplayOrder() != null ? item.getDisplayOrder() : 0)
                        .build();
                orgMemberConcurrentDeptRepository.save(cd);
                result.add(OrgMemberResponse.ConcurrentDeptInfo.of(cd));
            }
        }

        return result;
    }

    public List<OrgMemberResponse.MemberBoard> getMemberBoards(String orgId, String memberId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        OrganizationMember target = orgMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!target.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        String targetUserId = target.getUser().getId();
        List<Board> orgBoards = boardRepository.findByOrganizationId(orgId);

        // Batch query member counts for all org boards
        List<String> boardIds = orgBoards.stream().map(Board::getId).collect(Collectors.toList());
        Map<String, Long> memberCountMap = boardMemberRepository.countGroupedByBoardId(boardIds).stream()
                .collect(Collectors.toMap(
                        row -> (String) row[0],
                        row -> (Long) row[1]
                ));

        List<OrgMemberResponse.MemberBoard> result = new ArrayList<>();
        for (Board board : orgBoards) {
            boolean isMember = boardMemberRepository.existsByBoardIdAndUserId(board.getId(), targetUserId);
            if (isMember) {
                result.add(OrgMemberResponse.MemberBoard.builder()
                        .id(board.getId())
                        .name(board.getName())
                        .description(board.getDescription())
                        .ownerName(board.getOwner().getName())
                        .memberCount(memberCountMap.getOrDefault(board.getId(), 0L).intValue())
                        .createdAt(board.getCreatedAt())
                        .build());
            }
        }

        return result;
    }

    @Transactional
    public OrgMemberResponse.Detail uploadMemberProfileImage(String orgId, String memberId,
            String userId, MultipartFile file) {
        organizationService.getActiveOrgOrThrow(orgId);
        OrganizationMember requester = organizationService.getOrgMemberOrThrow(orgId, userId);
        OrganizationMember target = orgMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!target.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        boolean isSelf = requester.getId().equals(target.getId());
        if (!isSelf && !requester.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }

        userService.updateProfileImage(target.getUser().getId(), file);
        // Refresh target to get updated user
        OrganizationMember updated = orgMemberRepository.findByIdWithDetails(memberId).orElse(target);
        return OrgMemberResponse.Detail.of(updated);
    }

    @Transactional
    public OrgMemberResponse.Detail deleteMemberProfileImage(String orgId, String memberId, String userId) {
        organizationService.getActiveOrgOrThrow(orgId);
        OrganizationMember requester = organizationService.getOrgMemberOrThrow(orgId, userId);
        OrganizationMember target = orgMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!target.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        boolean isSelf = requester.getId().equals(target.getId());
        if (!isSelf && !requester.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }

        userService.deleteProfileImage(target.getUser().getId());
        OrganizationMember updated = orgMemberRepository.findByIdWithDetails(memberId).orElse(target);
        return OrgMemberResponse.Detail.of(updated);
    }

    public List<LeaveDto.BalanceResponse> getMemberLeaveBalances(String orgId, String memberId,
            String userId, Integer year) {
        OrganizationMember requester = organizationService.getOrgMemberOrThrow(orgId, userId);
        OrganizationMember target = orgMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!target.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        // Only ADMIN+ or self can view leave balances
        boolean isSelf = requester.getId().equals(target.getId());
        if (!isSelf && !requester.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }

        int targetYear = year != null ? year : LocalDate.now(ZoneOffset.UTC).getYear();
        return leaveBalanceRepository.findByOrgIdAndMemberIdAndYear(orgId, memberId, targetYear).stream()
                .map(LeaveDto.BalanceResponse::of)
                .collect(Collectors.toList());
    }
}
