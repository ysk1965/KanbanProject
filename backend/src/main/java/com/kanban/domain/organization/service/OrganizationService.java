package com.kanban.domain.organization.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.organization.leave.service.LeaveService;
import com.kanban.domain.organization.*;
import com.kanban.domain.organization.dto.*;
import com.kanban.domain.organization.repository.*;
import com.kanban.domain.subscription.OrgSubscription;
import com.kanban.domain.subscription.OrgSubscriptionRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.service.FileUploadService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;
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
    private final OrgPositionRepository orgPositionRepository;
    private final OrgTitleRepository orgTitleRepository;
    private final OrgGradeRepository orgGradeRepository;
    private final OrgMemberConcurrentDeptRepository orgMemberConcurrentDeptRepository;
    private final OrgInviteLinkRepository orgInviteLinkRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final FileUploadService fileUploadService;
    private final OrgSubscriptionRepository orgSubscriptionRepository;

    @org.springframework.beans.factory.annotation.Autowired
    @Lazy
    private LeaveService leaveService;

    // ==================== Organization CRUD ====================

    @Transactional
    public OrganizationResponse.Detail createOrganization(String userId, OrganizationRequest.Create request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 1인 1조직 정책: 이미 소속된 조직이 있는지 확인
        List<OrganizationMember> existingMemberships = orgMemberRepository.findByUserIdWithOrganization(userId);
        if (!existingMemberships.isEmpty()) {
            throw new BusinessException(ErrorCode.ALREADY_IN_ORGANIZATION);
        }

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

        // Create Trial subscription for new org
        OrgSubscription trial = OrgSubscription.createTrial(org);
        orgSubscriptionRepository.save(trial);
        org.markTrialUsed();

        return OrganizationResponse.Detail.of(org, OrgRole.OWNER, ownerMember.getId(), 1, 0);
    }

    public List<OrganizationResponse.Simple> getMyOrganizations(String userId) {
        List<OrganizationMember> memberships = orgMemberRepository.findByUserIdWithOrganization(userId);
        if (memberships.isEmpty()) return Collections.emptyList();

        List<String> orgIds = memberships.stream()
                .map(m -> m.getOrganization().getId())
                .collect(Collectors.toList());

        Map<String, Long> memberCountMap = orgMemberRepository.countGroupedByOrgIds(orgIds).stream()
                .collect(Collectors.toMap(r -> (String) r[0], r -> (Long) r[1]));
        Map<String, Long> boardCountMap = boardRepository.countGroupedByOrgIds(orgIds).stream()
                .collect(Collectors.toMap(r -> (String) r[0], r -> (Long) r[1]));

        return memberships.stream().map(m -> {
            Organization org = m.getOrganization();
            int memberCount = memberCountMap.getOrDefault(org.getId(), 0L).intValue();
            int boardCount = boardCountMap.getOrDefault(org.getId(), 0L).intValue();
            return OrganizationResponse.Simple.of(org, m.getRole(), memberCount, boardCount);
        }).collect(Collectors.toList());
    }

    public OrganizationResponse.Detail getOrganization(String orgId, String userId) {
        Organization org = getActiveOrgOrThrow(orgId);
        OrganizationMember member = getOrgMemberOrThrow(orgId, userId);
        int[] counts = getOrgCounts(orgId);
        return OrganizationResponse.Detail.of(org, member.getRole(), member.getId(), counts[0], counts[1]);
    }

    @Transactional
    public OrganizationResponse.Detail updateOrganization(String orgId, String userId, OrganizationRequest.Update request) {
        Organization org = getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);
        org.updateInfo(request.getName(), request.getDescription());
        int[] counts = getOrgCounts(orgId);
        OrganizationMember member = getOrgMemberOrThrow(orgId, userId);
        return OrganizationResponse.Detail.of(org, member.getRole(), member.getId(), counts[0], counts[1]);
    }

    @Transactional
    public OrganizationResponse.Detail uploadLogo(String orgId, String userId, MultipartFile file) {
        Organization org = getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);
        String key = "organizations/" + orgId + "/logo/" + UUID.randomUUID() + "_" + file.getOriginalFilename();
        String logoUrl = fileUploadService.uploadDirect(file, key);
        org.updateLogoUrl(logoUrl);
        int[] counts = getOrgCounts(orgId);
        OrganizationMember member = getOrgMemberOrThrow(orgId, userId);
        return OrganizationResponse.Detail.of(org, member.getRole(), member.getId(), counts[0], counts[1]);
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

        int[] counts = getOrgCounts(orgId);
        return OrganizationResponse.Detail.of(org, OrgRole.ADMIN, currentOwner.getId(), counts[0], counts[1]);
    }

    // ==================== Department CRUD ====================

    public List<OrgDepartmentResponse.Detail> getDepartments(String orgId, String userId) {
        getOrgMemberOrThrow(orgId, userId);
        return orgDepartmentRepository.findByOrganizationIdWithLeader(orgId).stream()
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

        OrganizationDepartment parentDept = null;
        if (request.getParentDepartmentId() != null) {
            parentDept = orgDepartmentRepository.findByIdAndOrganizationId(request.getParentDepartmentId(), orgId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.ORG_DEPARTMENT_NOT_FOUND));
        }

        OrganizationMember leader = null;
        if (request.getLeaderId() != null) {
            leader = orgMemberRepository.findById(request.getLeaderId())
                    .filter(m -> m.getOrganization().getId().equals(orgId))
                    .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        }

        OrganizationDepartment dept = OrganizationDepartment.builder()
                .organization(org)
                .name(request.getName())
                .displayOrder(request.getDisplayOrder() != null ? request.getDisplayOrder() : 0)
                .parentDepartment(parentDept)
                .leader(leader)
                .description(request.getDescription())
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
        if (request.getParentDepartmentId() != null) {
            if (request.getParentDepartmentId().isEmpty()) {
                dept.updateParentDepartment(null);
            } else {
                OrganizationDepartment parentDept = orgDepartmentRepository.findByIdAndOrganizationId(request.getParentDepartmentId(), orgId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.ORG_DEPARTMENT_NOT_FOUND));
                // Circular reference check
                checkCircularDepartmentReference(deptId, parentDept);
                dept.updateParentDepartment(parentDept);
            }
        }
        if (request.getLeaderId() != null) {
            if (request.getLeaderId().isEmpty()) {
                dept.updateLeader(null);
            } else {
                OrganizationMember leader = orgMemberRepository.findById(request.getLeaderId())
                        .filter(m -> m.getOrganization().getId().equals(orgId))
                        .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
                dept.updateLeader(leader);
            }
        }
        if (request.getDescription() != null) {
            dept.updateDescription(request.getDescription());
        }
        return OrgDepartmentResponse.Detail.of(dept);
    }

    @Transactional
    public void deleteDepartment(String orgId, String deptId, String userId) {
        getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        OrganizationDepartment dept = orgDepartmentRepository.findByIdAndOrganizationId(deptId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_DEPARTMENT_NOT_FOUND));

        // Promote child departments to parent level
        List<OrganizationDepartment> children = orgDepartmentRepository.findByOrganizationIdAndParentId(orgId, deptId);
        for (OrganizationDepartment child : children) {
            child.updateParentDepartment(dept.getParentDepartment());
        }

        // Clear member references before deletion to avoid FK constraint violation
        orgMemberRepository.clearDepartmentReference(deptId);
        orgMemberConcurrentDeptRepository.deleteByDepartmentId(deptId);

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

        // Clear member references before deletion to avoid FK constraint violation
        orgMemberRepository.clearJobGroupReference(jobGroupId);

        orgJobGroupRepository.delete(jobGroup);
    }

    // ==================== Position CRUD ====================

    public List<OrgPositionResponse.Detail> getPositions(String orgId, String userId) {
        getOrgMemberOrThrow(orgId, userId);
        return orgPositionRepository.findByOrganizationId(orgId).stream()
                .map(OrgPositionResponse.Detail::of)
                .collect(Collectors.toList());
    }

    @Transactional
    public OrgPositionResponse.Detail createPosition(String orgId, String userId, OrgPositionRequest.Create request) {
        Organization org = getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        if (orgPositionRepository.existsByOrganizationIdAndName(orgId, request.getName())) {
            throw new BusinessException(ErrorCode.ORG_POSITION_ALREADY_EXISTS);
        }

        OrganizationPosition position = OrganizationPosition.builder()
                .organization(org)
                .name(request.getName())
                .displayOrder(request.getDisplayOrder() != null ? request.getDisplayOrder() : 0)
                .build();
        orgPositionRepository.save(position);
        return OrgPositionResponse.Detail.of(position);
    }

    @Transactional
    public OrgPositionResponse.Detail updatePosition(String orgId, String positionId, String userId, OrgPositionRequest.Update request) {
        getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        OrganizationPosition position = orgPositionRepository.findByIdAndOrganizationId(positionId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_POSITION_NOT_FOUND));

        if (request.getName() != null) {
            if (orgPositionRepository.existsByOrganizationIdAndName(orgId, request.getName())
                && !position.getName().equals(request.getName())) {
                throw new BusinessException(ErrorCode.ORG_POSITION_ALREADY_EXISTS);
            }
            position.updateName(request.getName());
        }
        if (request.getDisplayOrder() != null) {
            position.updateDisplayOrder(request.getDisplayOrder());
        }
        return OrgPositionResponse.Detail.of(position);
    }

    @Transactional
    public void deletePosition(String orgId, String positionId, String userId) {
        getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        OrganizationPosition position = orgPositionRepository.findByIdAndOrganizationId(positionId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_POSITION_NOT_FOUND));

        orgMemberRepository.clearPositionReference(positionId);
        orgMemberConcurrentDeptRepository.clearPositionReference(positionId);
        orgPositionRepository.delete(position);
    }

    // ==================== Title CRUD ====================

    public List<OrgTitleResponse.Detail> getTitles(String orgId, String userId) {
        getOrgMemberOrThrow(orgId, userId);
        return orgTitleRepository.findByOrganizationId(orgId).stream()
                .map(OrgTitleResponse.Detail::of)
                .collect(Collectors.toList());
    }

    @Transactional
    public OrgTitleResponse.Detail createTitle(String orgId, String userId, OrgTitleRequest.Create request) {
        Organization org = getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        if (orgTitleRepository.existsByOrganizationIdAndName(orgId, request.getName())) {
            throw new BusinessException(ErrorCode.ORG_TITLE_ALREADY_EXISTS);
        }

        OrganizationTitle title = OrganizationTitle.builder()
                .organization(org)
                .name(request.getName())
                .displayOrder(request.getDisplayOrder() != null ? request.getDisplayOrder() : 0)
                .build();
        orgTitleRepository.save(title);
        return OrgTitleResponse.Detail.of(title);
    }

    @Transactional
    public OrgTitleResponse.Detail updateTitle(String orgId, String titleId, String userId, OrgTitleRequest.Update request) {
        getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        OrganizationTitle title = orgTitleRepository.findByIdAndOrganizationId(titleId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_TITLE_NOT_FOUND));

        if (request.getName() != null) {
            if (orgTitleRepository.existsByOrganizationIdAndName(orgId, request.getName())
                && !title.getName().equals(request.getName())) {
                throw new BusinessException(ErrorCode.ORG_TITLE_ALREADY_EXISTS);
            }
            title.updateName(request.getName());
        }
        if (request.getDisplayOrder() != null) {
            title.updateDisplayOrder(request.getDisplayOrder());
        }
        return OrgTitleResponse.Detail.of(title);
    }

    @Transactional
    public void deleteTitle(String orgId, String titleId, String userId) {
        getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        OrganizationTitle title = orgTitleRepository.findByIdAndOrganizationId(titleId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_TITLE_NOT_FOUND));

        orgMemberRepository.clearTitleReference(titleId);
        orgTitleRepository.delete(title);
    }

    // ==================== Grade CRUD ====================

    public List<OrgGradeResponse.Detail> getGrades(String orgId, String userId) {
        getOrgMemberOrThrow(orgId, userId);
        return orgGradeRepository.findByOrganizationId(orgId).stream()
                .map(OrgGradeResponse.Detail::of)
                .collect(Collectors.toList());
    }

    @Transactional
    public OrgGradeResponse.Detail createGrade(String orgId, String userId, OrgGradeRequest.Create request) {
        Organization org = getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        if (orgGradeRepository.existsByOrganizationIdAndName(orgId, request.getName())) {
            throw new BusinessException(ErrorCode.ORG_GRADE_ALREADY_EXISTS);
        }

        OrganizationGrade grade = OrganizationGrade.builder()
                .organization(org)
                .name(request.getName())
                .displayOrder(request.getDisplayOrder() != null ? request.getDisplayOrder() : 0)
                .build();
        orgGradeRepository.save(grade);
        return OrgGradeResponse.Detail.of(grade);
    }

    @Transactional
    public OrgGradeResponse.Detail updateGrade(String orgId, String gradeId, String userId, OrgGradeRequest.Update request) {
        getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        OrganizationGrade grade = orgGradeRepository.findByIdAndOrganizationId(gradeId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_GRADE_NOT_FOUND));

        if (request.getName() != null) {
            if (orgGradeRepository.existsByOrganizationIdAndName(orgId, request.getName())
                && !grade.getName().equals(request.getName())) {
                throw new BusinessException(ErrorCode.ORG_GRADE_ALREADY_EXISTS);
            }
            grade.updateName(request.getName());
        }
        if (request.getDisplayOrder() != null) {
            grade.updateDisplayOrder(request.getDisplayOrder());
        }
        return OrgGradeResponse.Detail.of(grade);
    }

    @Transactional
    public void deleteGrade(String orgId, String gradeId, String userId) {
        getActiveOrgOrThrow(orgId);
        checkAdminOrAbove(orgId, userId);

        OrganizationGrade grade = orgGradeRepository.findByIdAndOrganizationId(gradeId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_GRADE_NOT_FOUND));

        orgMemberRepository.clearGradeReference(gradeId);
        orgGradeRepository.delete(grade);
    }

    // ==================== Private Helpers ====================

    private void checkCircularDepartmentReference(String deptId, OrganizationDepartment parent) {
        Set<String> visited = new HashSet<>();
        OrganizationDepartment current = parent;
        while (current != null) {
            if (current.getId().equals(deptId)) {
                throw new BusinessException(ErrorCode.CIRCULAR_DEPARTMENT_REFERENCE);
            }
            if (!visited.add(current.getId())) {
                // Already visited — cycle detected in existing data
                break;
            }
            current = current.getParentDepartment();
        }
    }

    // ==================== Structure Data (Combined) ====================

    public OrganizationResponse.StructureData getStructureData(String orgId, String userId) {
        getOrgMemberOrThrow(orgId, userId);
        Organization org = getActiveOrgOrThrow(orgId);

        List<OrgDepartmentResponse.Detail> departments = orgDepartmentRepository.findByOrganizationIdWithLeader(orgId).stream()
                .map(OrgDepartmentResponse.Detail::of).collect(Collectors.toList());
        List<OrgJobGroupResponse.Detail> jobGroups = orgJobGroupRepository.findByOrganizationId(orgId).stream()
                .map(OrgJobGroupResponse.Detail::of).collect(Collectors.toList());
        List<OrgPositionResponse.Detail> positions = orgPositionRepository.findByOrganizationId(orgId).stream()
                .map(OrgPositionResponse.Detail::of).collect(Collectors.toList());
        List<OrgTitleResponse.Detail> titles = orgTitleRepository.findByOrganizationId(orgId).stream()
                .map(OrgTitleResponse.Detail::of).collect(Collectors.toList());
        List<OrgGradeResponse.Detail> grades = orgGradeRepository.findByOrganizationId(orgId).stream()
                .map(OrgGradeResponse.Detail::of).collect(Collectors.toList());

        return OrganizationResponse.StructureData.builder()
                .settings(OrganizationResponse.StructureSettings.of(org))
                .departments(departments)
                .jobGroups(jobGroups)
                .positions(positions)
                .titles(titles)
                .grades(grades)
                .build();
    }

    // ==================== Structure Settings ====================

    public OrganizationResponse.StructureSettings getStructureSettings(String orgId, String userId) {
        getOrgMemberOrThrow(orgId, userId);
        Organization org = getActiveOrgOrThrow(orgId);
        return OrganizationResponse.StructureSettings.of(org);
    }

    @Transactional
    public OrganizationResponse.StructureSettings updateStructureSettings(
            String orgId, String userId, OrganizationRequest.UpdateStructureSettings request) {
        checkAdminOrAbove(orgId, userId);
        Organization org = getActiveOrgOrThrow(orgId);
        org.updateStructureSettings(
                request.getDepartmentsEnabled(),
                request.getJobGroupsEnabled(),
                request.getPositionsEnabled(),
                request.getTitlesEnabled(),
                request.getGradesEnabled()
        );
        organizationRepository.save(org);
        return OrganizationResponse.StructureSettings.of(org);
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

    /**
     * Fetch member count and board count in a single DB query.
     * @return int[]{memberCount, boardCount}
     */
    private int[] getOrgCounts(String orgId) {
        List<Object[]> results = organizationRepository.countMemberAndBoardByOrgId(orgId);
        if (results == null || results.isEmpty()) return new int[]{0, 0};
        Object[] row = results.get(0);
        return new int[]{
                ((Number) row[0]).intValue(),
                ((Number) row[1]).intValue()
        };
    }
}
