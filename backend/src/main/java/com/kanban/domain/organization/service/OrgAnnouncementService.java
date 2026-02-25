package com.kanban.domain.organization.service;

import com.kanban.domain.organization.*;
import com.kanban.domain.organization.dto.OrgAnnouncementRequest;
import com.kanban.domain.organization.dto.OrgAnnouncementResponse;
import com.kanban.domain.organization.repository.OrgAnnouncementRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgAnnouncementService {

    private final OrgAnnouncementRepository announcementRepository;
    private final OrganizationService organizationService;
    private final OrgActivityService orgActivityService;

    public OrgAnnouncementResponse.ListResponse getAnnouncements(String orgId, String userId,
                                                                   LocalDateTime cursor, int limit) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        List<OrgAnnouncement> items;
        if (cursor != null) {
            items = announcementRepository.findByOrgIdWithCursor(orgId, cursor, PageRequest.of(0, limit + 1));
        } else {
            items = announcementRepository.findByOrgId(orgId, PageRequest.of(0, limit + 1));
        }

        return OrgAnnouncementResponse.ListResponse.of(items, limit);
    }

    @Transactional
    public OrgAnnouncementResponse.Detail create(String orgId, String userId,
                                                  OrgAnnouncementRequest.Create request) {
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);
        OrganizationMember member = organizationService.getOrgMemberOrThrow(orgId, userId);

        OrgAnnouncement announcement = OrgAnnouncement.builder()
                .organization(org)
                .author(member)
                .title(request.getTitle())
                .content(request.getContent())
                .isPinned(request.getIsPinned() != null ? request.getIsPinned() : false)
                .build();
        announcementRepository.save(announcement);

        // Log activity
        orgActivityService.log(org, member.getUser().getName(),
                OrgActivityType.ANNOUNCEMENT_POSTED, request.getTitle(), null);

        log.info("Announcement created: orgId={}, id={}", orgId, announcement.getId());
        return OrgAnnouncementResponse.Detail.of(announcement);
    }

    @Transactional
    public OrgAnnouncementResponse.Detail update(String orgId, String announcementId, String userId,
                                                  OrgAnnouncementRequest.Update request) {
        organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        OrgAnnouncement announcement = announcementRepository.findById(announcementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND));

        if (!announcement.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND);
        }

        announcement.update(request.getTitle(), request.getContent());
        return OrgAnnouncementResponse.Detail.of(announcement);
    }

    @Transactional
    public void delete(String orgId, String announcementId, String userId) {
        organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        OrgAnnouncement announcement = announcementRepository.findById(announcementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND));

        if (!announcement.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND);
        }

        announcementRepository.delete(announcement);
        log.info("Announcement deleted: orgId={}, id={}", orgId, announcementId);
    }

    @Transactional
    public OrgAnnouncementResponse.Detail togglePin(String orgId, String announcementId, String userId) {
        organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        OrgAnnouncement announcement = announcementRepository.findById(announcementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND));

        if (!announcement.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ORG_ANNOUNCEMENT_NOT_FOUND);
        }

        announcement.togglePin();
        return OrgAnnouncementResponse.Detail.of(announcement);
    }
}
