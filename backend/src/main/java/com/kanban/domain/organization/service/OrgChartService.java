package com.kanban.domain.organization.service;

import com.kanban.domain.organization.*;
import com.kanban.domain.organization.dto.OrgChartResponse;
import com.kanban.domain.organization.dto.OrgManagerRequest;
import com.kanban.domain.organization.repository.OrgDepartmentRepository;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgChartService {

    private final OrganizationService organizationService;
    private final OrgMemberRepository orgMemberRepository;
    private final OrgDepartmentRepository orgDepartmentRepository;
    private final OrgActivityService orgActivityService;

    public OrgChartResponse.ChartData getChart(String orgId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);
        Organization org = organizationService.getActiveOrgOrThrow(orgId);

        // Fetch all departments with leader info
        List<OrganizationDepartment> allDepts = orgDepartmentRepository.findByOrganizationIdWithLeader(orgId);

        // Fetch all active members
        List<OrganizationMember> members = orgMemberRepository.findActiveMembersWithDetails(
                orgId, List.of(WorkStatus.ACTIVE, WorkStatus.ON_LEAVE));

        // Group members by department
        Map<String, List<OrganizationMember>> membersByDept = new LinkedHashMap<>();
        List<OrganizationMember> unassigned = new ArrayList<>();
        for (OrganizationMember m : members) {
            if (m.getDepartment() != null) {
                membersByDept.computeIfAbsent(m.getDepartment().getId(), k -> new ArrayList<>()).add(m);
            } else {
                unassigned.add(m);
            }
        }

        // Build member lookup for tree construction
        Map<String, OrganizationMember> memberMap = members.stream()
                .collect(Collectors.toMap(OrganizationMember::getId, m -> m));

        // Build department hierarchy
        Map<String, List<OrganizationDepartment>> childrenByParent = new HashMap<>();
        List<OrganizationDepartment> roots = new ArrayList<>();
        for (OrganizationDepartment dept : allDepts) {
            if (dept.getParentDepartment() != null) {
                childrenByParent.computeIfAbsent(dept.getParentDepartment().getId(), k -> new ArrayList<>()).add(dept);
            } else {
                roots.add(dept);
            }
        }

        List<OrgChartResponse.DepartmentNode> deptTree = roots.stream()
                .map(root -> buildDeptNodeRecursive(root, childrenByParent, membersByDept, memberMap))
                .sorted(Comparator.comparingInt(OrgChartResponse.DepartmentNode::getDisplayOrder))
                .toList();

        List<OrgChartResponse.MemberNode> unassignedNodes = buildMemberTree(unassigned, memberMap);

        return OrgChartResponse.ChartData.builder()
                .organizationName(org.getName())
                .totalMembers(members.size())
                .departments(deptTree)
                .unassigned(unassignedNodes)
                .build();
    }

    private OrgChartResponse.DepartmentNode buildDeptNodeRecursive(
            OrganizationDepartment dept,
            Map<String, List<OrganizationDepartment>> childrenByParent,
            Map<String, List<OrganizationMember>> membersByDept,
            Map<String, OrganizationMember> allMembers) {

        List<OrganizationDepartment> children = childrenByParent.getOrDefault(dept.getId(), List.of());
        List<OrgChartResponse.DepartmentNode> childNodes = children.stream()
                .map(child -> buildDeptNodeRecursive(child, childrenByParent, membersByDept, allMembers))
                .sorted(Comparator.comparingInt(OrgChartResponse.DepartmentNode::getDisplayOrder))
                .toList();

        List<OrganizationMember> deptMembers = membersByDept.getOrDefault(dept.getId(), List.of());
        List<OrgChartResponse.MemberNode> memberNodes = buildMemberTree(deptMembers, allMembers);

        int memberCount = deptMembers.size();
        int totalMemberCount = memberCount + childNodes.stream()
                .mapToInt(OrgChartResponse.DepartmentNode::getTotalMemberCount).sum();

        OrgChartResponse.LeaderInfo leaderInfo = null;
        if (dept.getLeader() != null) {
            OrganizationMember leader = dept.getLeader();
            leaderInfo = OrgChartResponse.LeaderInfo.builder()
                    .memberId(leader.getId())
                    .userName(leader.getUser().getName())
                    .profileImageUrl(leader.getUser().getProfileImage())
                    .jobTitle(leader.getJobTitle())
                    .build();
        }

        return OrgChartResponse.DepartmentNode.builder()
                .id(dept.getId())
                .name(dept.getName())
                .description(dept.getDescription())
                .displayOrder(dept.getDisplayOrder())
                .parentDepartmentId(dept.getParentDepartment() != null ? dept.getParentDepartment().getId() : null)
                .memberCount(memberCount)
                .totalMemberCount(totalMemberCount)
                .childDeptCount(children.size())
                .leader(leaderInfo)
                .children(childNodes)
                .members(memberNodes)
                .build();
    }

    @Transactional
    public void updateManager(String orgId, String userId, String memberId, OrgManagerRequest request) {
        organizationService.checkAdminOrAbove(orgId, userId);
        OrganizationMember requester = organizationService.getOrgMemberOrThrow(orgId, userId);

        OrganizationMember member = orgMemberRepository.findById(memberId)
                .filter(m -> m.getOrganization().getId().equals(orgId))
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        if (request.getManagerId() == null) {
            // Remove manager
            member.updateManager(null);
            logManagerChanged(member.getOrganization(), requester, member, null);
            return;
        }

        // Self-reference check
        if (memberId.equals(request.getManagerId())) {
            throw new BusinessException(ErrorCode.SELF_MANAGER_NOT_ALLOWED);
        }

        OrganizationMember manager = orgMemberRepository.findById(request.getManagerId())
                .filter(m -> m.getOrganization().getId().equals(orgId))
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        // Circular reference check: walk up from manager, ensure memberId doesn't appear
        checkCircularReference(memberId, manager);

        member.updateManager(manager);
        logManagerChanged(member.getOrganization(), requester, member, manager);
    }

    private void checkCircularReference(String memberId, OrganizationMember manager) {
        Set<String> visited = new HashSet<>();
        OrganizationMember current = manager;
        int depth = 0;

        while (current != null && depth < 10) {
            if (current.getId().equals(memberId)) {
                throw new BusinessException(ErrorCode.CIRCULAR_MANAGER_REFERENCE);
            }
            if (!visited.add(current.getId())) {
                break; // Already visited, existing cycle in data
            }
            current = current.getManager();
            depth++;
        }

        if (depth >= 10) {
            throw new BusinessException(ErrorCode.MANAGER_CHAIN_TOO_DEEP);
        }
    }

    private List<OrgChartResponse.MemberNode> buildMemberTree(
            List<OrganizationMember> deptMembers,
            Map<String, OrganizationMember> allMembers) {
        // Find root members (no manager, or manager not in same department group)
        Set<String> deptMemberIds = deptMembers.stream()
                .map(OrganizationMember::getId)
                .collect(Collectors.toSet());

        List<OrganizationMember> roots = new ArrayList<>();
        Map<String, List<OrganizationMember>> childrenMap = new HashMap<>();

        for (OrganizationMember m : deptMembers) {
            String managerId = m.getManager() != null ? m.getManager().getId() : null;
            if (managerId == null || !deptMemberIds.contains(managerId)) {
                roots.add(m);
            } else {
                childrenMap.computeIfAbsent(managerId, k -> new ArrayList<>()).add(m);
            }
        }

        return roots.stream()
                .map(root -> buildNodeRecursive(root, childrenMap))
                .toList();
    }

    private OrgChartResponse.MemberNode buildNodeRecursive(
            OrganizationMember member,
            Map<String, List<OrganizationMember>> childrenMap) {
        List<OrganizationMember> children = childrenMap.getOrDefault(member.getId(), List.of());
        List<OrgChartResponse.MemberNode> reports = children.stream()
                .map(child -> buildNodeRecursive(child, childrenMap))
                .toList();

        return OrgChartResponse.MemberNode.builder()
                .id(member.getId())
                .userName(member.getUser().getName())
                .profileImageUrl(member.getUser().getProfileImage())
                .jobTitle(member.getJobTitle())
                .contractType(member.getContractType() != null ? member.getContractType().name() : null)
                .workStatus(member.getWorkStatus() != null ? member.getWorkStatus().name() : null)
                .managerId(member.getManager() != null ? member.getManager().getId() : null)
                .reports(reports)
                .build();
    }

    private void logManagerChanged(Organization org, OrganizationMember actor,
                                    OrganizationMember member, OrganizationMember newManager) {
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("memberId", member.getId());
        metadata.put("memberName", member.getUser().getName());
        metadata.put("newManagerName", newManager != null ? newManager.getUser().getName() : null);

        orgActivityService.log(org, actor.getUser().getName(),
                OrgActivityType.MANAGER_CHANGED, member.getUser().getName(), metadata);
    }
}
