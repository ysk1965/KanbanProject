package com.kanban.domain.organization.service;

import com.kanban.domain.organization.leave.service.LeaveService;
import com.kanban.domain.organization.*;
import com.kanban.domain.organization.dto.OrgInviteRequest;
import com.kanban.domain.organization.dto.OrgInviteResponse;
import com.kanban.domain.organization.repository.OrgInviteLinkRepository;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgInviteService {

    private final OrgInviteLinkRepository orgInviteLinkRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final UserRepository userRepository;
    private final OrganizationService organizationService;
    private final LeaveService leaveService;
    private final OrgOnboardingService onboardingService;

    @Transactional
    public OrgInviteResponse.Detail createInviteLink(String orgId, String userId, OrgInviteRequest.Create request) {
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        OrgRole role = request.getRole() != null ? request.getRole() : OrgRole.MEMBER;
        if (role == OrgRole.OWNER) {
            role = OrgRole.MEMBER;
        }

        LocalDateTime expiresAt = null;
        if (request.getExpiresInDays() != null && request.getExpiresInDays() > 0) {
            expiresAt = LocalDateTime.now(ZoneOffset.UTC).plusDays(request.getExpiresInDays());
        }

        OrganizationInviteLink link = OrganizationInviteLink.builder()
                .organization(org)
                .role(role)
                .maxUses(request.getMaxUses())
                .expiresAt(expiresAt)
                .createdBy(creator)
                .build();
        orgInviteLinkRepository.save(link);
        return OrgInviteResponse.Detail.of(link);
    }

    public List<OrgInviteResponse.Detail> getInviteLinks(String orgId, String userId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        return orgInviteLinkRepository.findByOrganizationId(orgId).stream()
                .map(OrgInviteResponse.Detail::of)
                .collect(Collectors.toList());
    }

    @Transactional
    public void deleteInviteLink(String orgId, String linkId, String userId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        OrganizationInviteLink link = orgInviteLinkRepository.findByIdAndOrganizationId(linkId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_INVITE_NOT_FOUND));
        orgInviteLinkRepository.delete(link);
    }

    // Public endpoints (no auth required for info, user auth required for accept)

    public OrgInviteResponse.PublicInfo getInviteInfo(String code) {
        OrganizationInviteLink link = orgInviteLinkRepository.findByCode(code)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_INVITE_NOT_FOUND));

        if (!link.isValid()) {
            throw new BusinessException(ErrorCode.ORG_INVITE_INVALID);
        }

        Organization org = link.getOrganization();
        if (org.isDeleted()) {
            throw new BusinessException(ErrorCode.ORG_INVITE_INVALID);
        }

        int memberCount = orgMemberRepository.countByOrganizationId(org.getId());

        return OrgInviteResponse.PublicInfo.builder()
                .organizationName(org.getName())
                .logoUrl(org.getLogoUrl())
                .memberCount(memberCount)
                .role(link.getRole())
                .build();
    }

    @Transactional
    public Map<String, String> acceptInvite(String code, String userId) {
        OrganizationInviteLink link = orgInviteLinkRepository.findByCode(code)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_INVITE_NOT_FOUND));

        if (!link.isValid()) {
            throw new BusinessException(ErrorCode.ORG_INVITE_INVALID);
        }

        Organization org = link.getOrganization();
        if (org.isDeleted()) {
            throw new BusinessException(ErrorCode.ORG_INVITE_INVALID);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // Check if already a member
        if (orgMemberRepository.existsByOrganizationIdAndUserId(org.getId(), userId)) {
            throw new BusinessException(ErrorCode.ORG_MEMBER_ALREADY_EXISTS);
        }

        // Create member
        OrganizationMember newMember = OrganizationMember.builder()
                .organization(org)
                .user(user)
                .role(link.getRole())
                .build();
        orgMemberRepository.save(newMember);

        // Create leave balances for new member
        leaveService.createBalancesForNewMember(org, newMember);

        // Auto-assign onboarding checklists
        onboardingService.autoAssignOnboarding(org, newMember);

        // Increment used count
        link.incrementUsedCount();

        log.info("Organization invite accepted: orgId={}, userId={}, code={}", org.getId(), userId, code);

        return Map.of(
                "organization_id", org.getId(),
                "organization_name", org.getName(),
                "role", link.getRole().name(),
                "message", "조직에 가입되었습니다."
        );
    }
}
