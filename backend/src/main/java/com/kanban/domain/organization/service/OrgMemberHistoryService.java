package com.kanban.domain.organization.service;

import com.kanban.domain.organization.*;
import com.kanban.domain.organization.dto.OrgMemberHistoryRequest;
import com.kanban.domain.organization.dto.OrgMemberHistoryResponse;
import com.kanban.domain.organization.repository.*;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgMemberHistoryService {

    private final OrgMemberHistoryRepository historyRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final OrgDepartmentRepository orgDepartmentRepository;
    private final OrgPositionRepository orgPositionRepository;
    private final OrgTitleRepository orgTitleRepository;
    private final OrgGradeRepository orgGradeRepository;
    private final OrgJobGroupRepository orgJobGroupRepository;
    private final OrganizationService organizationService;

    public List<OrgMemberHistoryResponse.Item> getHistory(String orgId, String memberId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        OrganizationMember target = orgMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!target.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        return historyRepository.findByMemberIdOrderByEffectiveStartDateDesc(memberId).stream()
                .map(OrgMemberHistoryResponse.Item::of)
                .collect(Collectors.toList());
    }

    @Transactional
    public OrgMemberHistoryResponse.Item createHistory(String orgId, String memberId, String userId,
                                                        OrgMemberHistoryRequest.Create request) {
        organizationService.checkAdminOrAbove(orgId, userId);
        OrganizationMember requester = organizationService.getOrgMemberOrThrow(orgId, userId);

        OrganizationMember target = orgMemberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!target.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND);
        }

        LocalDate startDate = request.getEffectiveStartDate() != null
                ? request.getEffectiveStartDate()
                : LocalDate.now(ZoneOffset.UTC);

        // Close current open record
        closeCurrentOpenRecords(memberId, startDate.minusDays(1));

        // Resolve names
        String deptId = request.getDepartmentId();
        String deptName = resolveDepartmentName(deptId, orgId);
        String posId = request.getPositionId();
        String posName = resolvePositionName(posId, orgId);
        String titId = request.getTitleId();
        String titName = resolveTitleName(titId, orgId);
        String grdId = request.getGradeId();
        String grdName = resolveGradeName(grdId, orgId);
        String jgId = request.getJobGroupId();
        String jgName = resolveJobGroupName(jgId, orgId);

        OrgMemberHistory history = OrgMemberHistory.builder()
                .organization(target.getOrganization())
                .member(target)
                .departmentId(deptId)
                .departmentName(deptName)
                .positionId(posId)
                .positionName(posName)
                .titleId(titId)
                .titleName(titName)
                .gradeId(grdId)
                .gradeName(grdName)
                .jobGroupId(jgId)
                .jobGroupName(jgName)
                .jobTitle(request.getJobTitle())
                .effectiveStartDate(startDate)
                .description(request.getDescription())
                .createdById(requester.getId())
                .source("MANUAL")
                .build();

        historyRepository.save(history);
        return OrgMemberHistoryResponse.Item.of(history);
    }

    @Transactional
    public OrgMemberHistoryResponse.Item updateDescription(String orgId, String historyId, String userId,
                                                            String description) {
        OrganizationMember requester = organizationService.getOrgMemberOrThrow(orgId, userId);

        OrgMemberHistory history = historyRepository.findByIdAndOrganizationId(historyId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_HISTORY_NOT_FOUND));

        // Admin or self (member who owns this history)
        boolean isAdmin = requester.isAdminOrAbove();
        boolean isSelf = history.getMember().getId().equals(requester.getId());
        if (!isAdmin && !isSelf) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }

        history.updateDescription(description);
        return OrgMemberHistoryResponse.Item.of(history);
    }

    @Transactional
    public void deleteHistory(String orgId, String historyId, String userId) {
        organizationService.checkAdminOrAbove(orgId, userId);

        OrgMemberHistory history = historyRepository.findByIdAndOrganizationId(historyId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_HISTORY_NOT_FOUND));

        historyRepository.delete(history);
    }

    /**
     * Called from OrgMemberService.updateMember() to auto-create history when HR fields change.
     */
    @Transactional
    public void recordChangeIfNeeded(OrganizationMember target, HrSnapshot before, HrSnapshot after,
                                     String requesterId) {
        if (before.hrFieldsMatch(after)) {
            return;
        }

        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        closeCurrentOpenRecords(target.getId(), today.minusDays(1));

        OrgMemberHistory history = OrgMemberHistory.builder()
                .organization(target.getOrganization())
                .member(target)
                .departmentId(after.departmentId())
                .departmentName(after.departmentName())
                .positionId(after.positionId())
                .positionName(after.positionName())
                .titleId(after.titleId())
                .titleName(after.titleName())
                .gradeId(after.gradeId())
                .gradeName(after.gradeName())
                .jobGroupId(after.jobGroupId())
                .jobGroupName(after.jobGroupName())
                .jobTitle(after.jobTitle())
                .effectiveStartDate(today)
                .createdById(requesterId)
                .source("AUTO")
                .build();

        historyRepository.save(history);
        log.info("Auto-created member history: memberId={}, changes detected", target.getId());
    }

    // --- Snapshot record for before/after comparison ---

    public record HrSnapshot(
            String departmentId, String departmentName,
            String positionId, String positionName,
            String titleId, String titleName,
            String gradeId, String gradeName,
            String jobGroupId, String jobGroupName,
            String jobTitle
    ) {
        public static HrSnapshot of(OrganizationMember m) {
            return new HrSnapshot(
                    m.getDepartment() != null ? m.getDepartment().getId() : null,
                    m.getDepartment() != null ? m.getDepartment().getName() : null,
                    m.getPosition() != null ? m.getPosition().getId() : null,
                    m.getPosition() != null ? m.getPosition().getName() : null,
                    m.getTitle() != null ? m.getTitle().getId() : null,
                    m.getTitle() != null ? m.getTitle().getName() : null,
                    m.getGrade() != null ? m.getGrade().getId() : null,
                    m.getGrade() != null ? m.getGrade().getName() : null,
                    m.getJobGroup() != null ? m.getJobGroup().getId() : null,
                    m.getJobGroup() != null ? m.getJobGroup().getName() : null,
                    m.getJobTitle()
            );
        }

        public boolean hrFieldsMatch(HrSnapshot other) {
            return Objects.equals(departmentId, other.departmentId) &&
                    Objects.equals(positionId, other.positionId) &&
                    Objects.equals(titleId, other.titleId) &&
                    Objects.equals(gradeId, other.gradeId) &&
                    Objects.equals(jobGroupId, other.jobGroupId);
        }
    }

    // --- Private helpers ---

    private void closeCurrentOpenRecords(String memberId, LocalDate endDate) {
        List<OrgMemberHistory> openRecords = historyRepository.findByMemberIdAndEffectiveEndDateIsNull(memberId);
        for (OrgMemberHistory record : openRecords) {
            record.close(endDate);
        }
    }

    private String resolveDepartmentName(String id, String orgId) {
        if (id == null || id.isEmpty()) return null;
        return orgDepartmentRepository.findByIdAndOrganizationId(id, orgId)
                .map(OrganizationDepartment::getName).orElse(null);
    }

    private String resolvePositionName(String id, String orgId) {
        if (id == null || id.isEmpty()) return null;
        return orgPositionRepository.findByIdAndOrganizationId(id, orgId)
                .map(OrganizationPosition::getName).orElse(null);
    }

    private String resolveTitleName(String id, String orgId) {
        if (id == null || id.isEmpty()) return null;
        return orgTitleRepository.findByIdAndOrganizationId(id, orgId)
                .map(OrganizationTitle::getName).orElse(null);
    }

    private String resolveGradeName(String id, String orgId) {
        if (id == null || id.isEmpty()) return null;
        return orgGradeRepository.findByIdAndOrganizationId(id, orgId)
                .map(OrganizationGrade::getName).orElse(null);
    }

    private String resolveJobGroupName(String id, String orgId) {
        if (id == null || id.isEmpty()) return null;
        return orgJobGroupRepository.findByIdAndOrganizationId(id, orgId)
                .map(OrganizationJobGroup::getName).orElse(null);
    }
}
