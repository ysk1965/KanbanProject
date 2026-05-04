package com.kanban.domain.photo.service;

import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.repository.OrganizationRepository;
import com.kanban.domain.organization.service.OrganizationService;
import com.kanban.domain.photo.OrgPhotoTab;
import com.kanban.domain.photo.OrgPhotoTabRepository;
import com.kanban.domain.photo.PhotoShareLink;
import com.kanban.domain.photo.PhotoShareLinkRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PhotoShareLinkService {

    private static final int MAX_EXPIRES_DAYS = 365;

    private final PhotoShareLinkRepository linkRepository;
    private final OrgPhotoTabRepository tabRepository;
    private final OrganizationRepository organizationRepository;
    private final OrganizationService organizationService;
    private final UserRepository userRepository;

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public PhotoShareLink issue(String orgId, String userId, String tabId,
                                PhotoShareLink.LinkType linkType,
                                Integer expiresInDays, String title) {
        organizationService.checkAdminOrAbove(orgId, userId);

        Organization org = organizationRepository.findActiveById(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        OrgPhotoTab tab = null;
        if (tabId != null && !tabId.isEmpty()) {
            tab = tabRepository.findByIdAndOrganizationId(tabId, orgId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));
        }

        LocalDateTime expiresAt = null;
        if (expiresInDays != null && expiresInDays > 0) {
            int days = Math.min(expiresInDays, MAX_EXPIRES_DAYS);
            expiresAt = LocalDateTime.now(ZoneOffset.UTC).plusDays(days);
        }

        PhotoShareLink link = PhotoShareLink.builder()
                .organization(org)
                .tab(tab)
                .linkType(linkType)
                .title(title)
                .expiresAt(expiresAt)
                .createdBy(user)
                .build();
        link = linkRepository.save(link);

        syncLegacyCanonical(org, tab, linkType);
        log.info("Photo share link issued: orgId={}, tabId={}, type={}, expiresInDays={}, by={}",
                orgId, tabId, linkType, expiresInDays, userId);
        return link;
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public void revoke(String orgId, String userId, String linkId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        PhotoShareLink link = linkRepository.findById(linkId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_SHARE_LINK_NOT_FOUND));
        if (!link.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.PHOTO_SHARE_LINK_NOT_FOUND);
        }
        if (link.isRevoked()) {
            return;
        }
        link.revoke(user);

        syncLegacyCanonical(link.getOrganization(), link.getTab(), link.getLinkType());
        log.info("Photo share link revoked: orgId={}, linkId={}, by={}", orgId, linkId, userId);
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public void revokeAllForTab(String orgId, String tabId, String userId, PhotoShareLink.LinkType type) {
        organizationService.checkAdminOrAbove(orgId, userId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        OrgPhotoTab tab = tabRepository.findByIdAndOrganizationId(tabId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));

        List<PhotoShareLink> links = linkRepository.findActiveByOrganizationIdAndTabId(orgId, tabId).stream()
                .filter(l -> l.getLinkType() == type)
                .toList();
        for (PhotoShareLink link : links) {
            link.revoke(user);
        }
        syncLegacyCanonical(tab.getOrganization(), tab, type);
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public void revokeAllGalleryLinks(String orgId, String userId, PhotoShareLink.LinkType type) {
        organizationService.checkAdminOrAbove(orgId, userId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        Organization org = organizationRepository.findActiveById(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));

        List<PhotoShareLink> links = linkRepository.findActiveGalleryLinksByOrganizationId(orgId).stream()
                .filter(l -> l.getLinkType() == type)
                .toList();
        for (PhotoShareLink link : links) {
            link.revoke(user);
        }
        syncLegacyCanonical(org, null, type);
    }

    public List<PhotoShareLink> list(String orgId, String userId, String tabId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        if (tabId != null && !tabId.isEmpty()) {
            return linkRepository.findActiveByOrganizationIdAndTabId(orgId, tabId);
        }
        return linkRepository.findActiveByOrganizationId(orgId);
    }

    public Optional<PhotoShareLink> lookupActive(String token, PhotoShareLink.LinkType expectedType) {
        return linkRepository.findByTokenAndRevokedAtIsNull(token)
                .filter(link -> !link.isExpired())
                .filter(link -> link.getLinkType() == expectedType);
    }

    @Transactional
    public void recordAccess(String token) {
        linkRepository.findByTokenAndRevokedAtIsNull(token).ifPresent(PhotoShareLink::recordAccess);
    }

    /**
     * Recompute legacy canonical token columns to reflect "most recent active link" of given type.
     * Active = revoked_at IS NULL && (expires_at IS NULL || expires_at > now).
     */
    private void syncLegacyCanonical(Organization org, OrgPhotoTab tab, PhotoShareLink.LinkType type) {
        List<PhotoShareLink> active;
        if (tab != null) {
            active = linkRepository.findActiveByOrganizationIdAndTabId(org.getId(), tab.getId());
        } else {
            active = linkRepository.findActiveGalleryLinksByOrganizationId(org.getId());
        }
        PhotoShareLink canonical = active.stream()
                .filter(l -> l.getLinkType() == type)
                .filter(l -> !l.isExpired())
                .findFirst()
                .orElse(null);

        if (tab != null) {
            if (type == PhotoShareLink.LinkType.VIEW) {
                tab.adoptShareToken(canonical != null ? canonical.getToken() : null);
            } else {
                tab.adoptUploadToken(
                        canonical != null ? canonical.getToken() : null,
                        canonical != null ? canonical.getExpiresAt() : null);
            }
        } else {
            if (type == PhotoShareLink.LinkType.VIEW) {
                org.adoptGalleryShareToken(
                        canonical != null ? canonical.getToken() : null,
                        canonical != null ? canonical.getTitle() : null);
            } else {
                org.adoptGalleryUploadToken(
                        canonical != null ? canonical.getToken() : null,
                        canonical != null ? canonical.getExpiresAt() : null);
            }
        }
    }
}
