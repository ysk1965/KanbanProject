package com.kanban.domain.organization.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.leave.service.LeaveService;
import com.kanban.domain.organization.*;
import com.kanban.domain.organization.dto.*;
import com.kanban.domain.organization.repository.*;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.service.FileUploadService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrganizationService {

    private final OrganizationRepository organizationRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final OrgDepartmentRepository orgDepartmentRepository;
    private final OrgJobGroupRepository orgJobGroupRepository;
    private final OrgInviteLinkRepository orgInviteLinkRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final FileUploadService fileUploadService;

    @org.springframework.beans.factory.annotation.Autowired
    @Lazy
    private LeaveService leaveService;

    // ==================== Organization CRUD ====================

    @Transactional
    public OrganizationResponse.Detail createOrganization(String userId, OrganizationRequest.Create request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Organization org = Organization.builder()
                .name(request.getName())
                .description(request.getDescription())
                .owner(user)
                .build();
        organizationRepository.save(org);

        OrganizationMember ownerMember = OrganizationMember.builder()
                .organization(org)
                .user(user)
                .role(OrgRole.OWNER)
                .build();
        orgMemberRepository.save(ownerMember);

        // Create default leave policies and balance for owner
        leaveService.createDefaultPolicies(org);
        leaveService.createBalancesForNewMember(org, ownerMember);

        return OrganizationResponse.Detail.of(org, OrgRole.OWNER, 1, 0);
    }

    public List<OrganizationResponse.Simple> getMyOrganizations(String userId) {
        List<Organization> orgs = organizationRepository.findByUserId(userId);
        return orgs.stream().map(org -> {
            OrganizationMember member = orgMemberRepository.findByOrganizationIdAndUserId(org.getId(), userId)
                    .orElse(null);
            OrgRole myRole = member != null ? member.getRole() : OrgRole.MEMBER;
            int memberCount = orgMemberRepository.countByOrganizationId(org.getId());
            int boardCount = boardRepository.findByOrganizationId(org.getId()).size();
            return OrganizationResponse.Simple.of(org, myRole, memberCount, boardCount);
        }).collect(Collectors.toList());
    }

    public OrganizationResponse.Detail getOrganization(String orgId, String userId) {
        Organization org = getActiveOrgOrThrow(orgId);
        OrganizationMember member = getOrgMemberOrThrow(orgId, userId);
        int memberCount = orgMemberRepository.countByOrganizationId(orgId);
        int boardCount = boardRepository.findByOrganizationId(orgId).size();
        return OrganizationResponse.Detail.of(org, member.getRole(), memberCount, boardCount);
    }

    @Transactional
    public OrganizationResponse.Detail updateOrganization(String orgId, String userId, OrganizationRequest.Update request) {
        Organization org = getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);
        org.updateInfo(request.getName(), request.getDescription());
        int memberCount = orgMemberRepository.countByOrganizationId(orgId);
        int boardCount = boardRepository.findByOrganizationId(orgId).size();
        OrganizationMember member = getOrgMemberOrThrow(orgId, userId);
        return OrganizationResponse.Detail.of(org, member.getRole(), memberCount, boardCount);
    }

    @Transactional
    public OrganizationResponse.Detail uploadLogo(String orgId, String userId, MultipartFile file) {
        Organization org = getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);
        String key = "organizations/" + orgId + "/logo/" + UUID.randomUUID() + "_" + file.getOriginalFilename();
        String logoUrl = fileUploadService.uploadDirect(file, key);
        org.updateLogoUrl(logoUrl);
        int memberCount = orgMemberRepository.countByOrganizationId(orgId);
        int boardCount = boardRepository.findByOrganizationId(orgId).size();
        OrganizationMember member = getOrgMemberOrThrow(orgId, userId);
        return OrganizationResponse.Detail.of(org, member.getRole(), memberCount, boardCount);
    }

    @Transactional
    public void deleteOrganization(String orgId, String userId) {
        Organization org = getActiveOrgOrThrow(orgId);
        checkOwner(orgId, userId);

        // Release all boards from organization
        List<Board> orgBoards = boardRepository.findByOrganizationId(orgId);
        for (Board board : orgBoards) {
            board.removeOrganization();
        }

        // Deactivate all invite links
        orgInviteLinkRepository.deactivateAllByOrganizationId(orgId);

        // Soft delete organization
        org.softDelete();
        log.info("Organization deleted: orgId={}, userId={}", orgId, userId);
    }

    @Transactional
    public OrganizationResponse.Detail transferOwnership(String orgId, String userId, OrganizationRequest.TransferOwnership request) {
        Organization org = getActiveOrgOrThrow(orgId);
        checkOwner(orgId, userId);

        OrganizationMember currentOwner = getOrgMemberOrThrow(orgId, userId);
        OrganizationMember newOwnerMember = orgMemberRepository.findById(request.getMemberId())
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        if (!newOwnerMember.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        if (currentOwner.getId().equals(newOwnerMember.getId())) {
            throw new BusinessException(ErrorCode.CANNOT_TRANSFER_TO_SELF);
        }

        currentOwner.updateRole(OrgRole.ADMIN);
        newOwnerMember.updateRole(OrgRole.OWNER);
        org.transferOwnership(newOwnerMember.getUser());

        int memberCount = orgMemberRepository.countByOrganizationId(orgId);
        int boardCount = boardRepository.findByOrganizationId(orgId).size();
        return OrganizationResponse.Detail.of(org, OrgRole.ADMIN, memberCount, boardCount);
    }

    // ==================== Department CRUD ====================

    public List<OrgDepartmentResponse.Detail> getDepartments(String orgId, String userId) {
        getOrgMemberOrThrow(orgId, userId);
        return orgDepartmentRepository.findByOrganizationId(orgId).stream()
                .map(OrgDepartmentResponse.Detail::of)
                .collect(Collectors.toList());
    }

    @Transactional
    public OrgDepartmentResponse.Detail createDepartment(String orgId, String userId, OrgDepartmentRequest.Create request) {
        Organization org = getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        if (orgDepartmentRepository.existsByOrganizationIdAndName(orgId, request.getName())) {
            throw new BusinessException(ErrorCode.ORG_DEPARTMENT_ALREADY_EXISTS);
        }

        OrganizationDepartment dept = OrganizationDepartment.builder()
                .organization(org)
                .name(request.getName())
                .displayOrder(request.getDisplayOrder() != null ? request.getDisplayOrder() : 0)
                .build();
        orgDepartmentRepository.save(dept);
        return OrgDepartmentResponse.Detail.of(dept);
    }

    @Transactional
    public OrgDepartmentResponse.Detail updateDepartment(String orgId, String deptId, String userId, OrgDepartmentRequest.Update request) {
        getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        OrganizationDepartment dept = orgDepartmentRepository.findByIdAndOrganizationId(deptId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_DEPARTMENT_NOT_FOUND));

        if (request.getName() != null) {
            if (orgDepartmentRepository.existsByOrganizationIdAndName(orgId, request.getName())
                && !dept.getName().equals(request.getName())) {
                throw new BusinessException(ErrorCode.ORG_DEPARTMENT_ALREADY_EXISTS);
            }
            dept.updateName(request.getName());
        }
        if (request.getDisplayOrder() != null) {
            dept.updateDisplayOrder(request.getDisplayOrder());
        }
        return OrgDepartmentResponse.Detail.of(dept);
    }

    @Transactional
    public void deleteDepartment(String orgId, String deptId, String userId) {
        getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        OrganizationDepartment dept = orgDepartmentRepository.findByIdAndOrganizationId(deptId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_DEPARTMENT_NOT_FOUND));

        orgDepartmentRepository.delete(dept);
    }

    // ==================== Job Group CRUD ====================

    public List<OrgJobGroupResponse.Detail> getJobGroups(String orgId, String userId) {
        getOrgMemberOrThrow(orgId, userId);
        return orgJobGroupRepository.findByOrganizationId(orgId).stream()
                .map(OrgJobGroupResponse.Detail::of)
                .collect(Collectors.toList());
    }

    @Transactional
    public OrgJobGroupResponse.Detail createJobGroup(String orgId, String userId, OrgJobGroupRequest.Create request) {
        Organization org = getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        if (orgJobGroupRepository.existsByOrganizationIdAndName(orgId, request.getName())) {
            throw new BusinessException(ErrorCode.ORG_JOB_GROUP_ALREADY_EXISTS);
        }

        OrganizationJobGroup jobGroup = OrganizationJobGroup.builder()
                .organization(org)
                .name(request.getName())
                .displayOrder(request.getDisplayOrder() != null ? request.getDisplayOrder() : 0)
                .build();
        orgJobGroupRepository.save(jobGroup);
        return OrgJobGroupResponse.Detail.of(jobGroup);
    }

    @Transactional
    public OrgJobGroupResponse.Detail updateJobGroup(String orgId, String jobGroupId, String userId, OrgJobGroupRequest.Update request) {
        getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        OrganizationJobGroup jobGroup = orgJobGroupRepository.findByIdAndOrganizationId(jobGroupId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_JOB_GROUP_NOT_FOUND));

        if (request.getName() != null) {
            if (orgJobGroupRepository.existsByOrganizationIdAndName(orgId, request.getName())
                && !jobGroup.getName().equals(request.getName())) {
                throw new BusinessException(ErrorCode.ORG_JOB_GROUP_ALREADY_EXISTS);
            }
            jobGroup.updateName(request.getName());
        }
        if (request.getDisplayOrder() != null) {
            jobGroup.updateDisplayOrder(request.getDisplayOrder());
        }
        return OrgJobGroupResponse.Detail.of(jobGroup);
    }

    @Transactional
    public void deleteJobGroup(String orgId, String jobGroupId, String userId) {
        getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        OrganizationJobGroup jobGroup = orgJobGroupRepository.findByIdAndOrganizationId(jobGroupId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_JOB_GROUP_NOT_FOUND));

        orgJobGroupRepository.delete(jobGroup);
    }

    // ==================== Helper Methods ====================

    public Organization getActiveOrgOrThrow(String orgId) {
        return organizationRepository.findActiveById(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_NOT_FOUND));
    }

    public OrganizationMember getOrgMemberOrThrow(String orgId, String userId) {
        return orgMemberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_ACCESS_DENIED));
    }

    public void checkAdminOrAbove(String orgId, String userId) {
        OrganizationMember member = getOrgMemberOrThrow(orgId, userId);
        if (!member.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }
    }

    public void checkOwner(String orgId, String userId) {
        OrganizationMember member = getOrgMemberOrThrow(orgId, userId);
        if (!member.isOwner()) {
            throw new BusinessException(ErrorCode.ORG_OWNER_REQUIRED);
        }
    }
}
