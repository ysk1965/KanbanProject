package com.kanban.domain.photo.service;

import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.repository.OrganizationRepository;
import com.kanban.domain.organization.service.OrganizationService;
import com.kanban.domain.photo.OrgPhoto;
import com.kanban.domain.photo.OrgPhotoRepository;
import com.kanban.domain.photo.OrgPhotoTab;
import com.kanban.domain.photo.OrgPhotoTabRepository;
import com.kanban.domain.photo.PhotoShareLink;
import com.kanban.domain.photo.dto.OrgPhotoRequest;
import com.kanban.domain.photo.dto.OrgPhotoResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.service.AsyncThumbnailService;
import com.kanban.global.service.FileUploadService;
import com.kanban.global.util.MediaUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgPhotoService {

    private final OrgPhotoTabRepository orgPhotoTabRepository;
    private final OrgPhotoRepository orgPhotoRepository;
    private final OrganizationRepository organizationRepository;
    private final OrganizationService organizationService;
    private final FileUploadService fileUploadService;
    private final AsyncThumbnailService asyncThumbnailService;
    private final UserRepository userRepository;
    private final PhotoShareLinkService photoShareLinkService;

    private static final int MAX_UPLOAD_FILES = 20;
    private static final int MAX_BATCH_DOWNLOAD = 100;
    private static final int THUMBNAIL_MAX_WIDTH = 400;
    private static final int THUMBNAIL_MAX_HEIGHT = 400;

    // ==================== Tab Operations ====================

    public List<OrgPhotoResponse.TabInfo> getTabs(String orgId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);
        return orgPhotoTabRepository.findByOrganizationIdOrderBySortOrder(orgId).stream()
                .map(OrgPhotoResponse.TabInfo::from)
                .toList();
    }

    @Transactional
    public OrgPhotoResponse.TabInfo createTab(String orgId, String userId, OrgPhotoRequest.TabCreate request) {
        organizationService.checkAdminOrAbove(orgId, userId);
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        int nextSortOrder = (int) orgPhotoTabRepository.countByOrganizationId(orgId);

        OrgPhotoTab tab = OrgPhotoTab.builder()
                .organization(org)
                .name(request.getName())
                .description(request.getDescription())
                .sortOrder(nextSortOrder)
                .createdBy(user)
                .build();
        orgPhotoTabRepository.save(tab);

        log.info("Photo tab created: tabId={}, orgId={}, userId={}", tab.getId(), orgId, userId);
        return OrgPhotoResponse.TabInfo.from(tab);
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public OrgPhotoResponse.TabInfo updateTab(String orgId, String userId, String tabId, OrgPhotoRequest.TabUpdate request) {
        organizationService.checkAdminOrAbove(orgId, userId);
        OrgPhotoTab tab = getTabOrThrow(tabId, orgId);

        tab.update(request.getName(), request.getDescription());

        if (request.getCoverPhotoId() != null) {
            if (request.getCoverPhotoId().isEmpty()) {
                tab.updateCoverPhoto(null);
            } else {
                OrgPhoto coverPhoto = orgPhotoRepository.findById(request.getCoverPhotoId())
                        .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_NOT_FOUND));
                tab.updateCoverPhoto(coverPhoto);
            }
        }

        log.info("Photo tab updated: tabId={}, orgId={}, userId={}", tabId, orgId, userId);
        return OrgPhotoResponse.TabInfo.from(tab);
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public void deleteTab(String orgId, String userId, String tabId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        OrgPhotoTab tab = getTabOrThrow(tabId, orgId);

        // Delete all S3 files for photos in this tab
        List<OrgPhoto> photos = orgPhotoRepository.findByTabId(tabId);
        for (OrgPhoto photo : photos) {
            deletePhotoFromS3(photo);
        }

        // Clear cover photo reference before deleting photos
        tab.updateCoverPhoto(null);
        orgPhotoTabRepository.flush();

        // JPQL bulk delete + clearAutomatically clears persistence context
        orgPhotoRepository.deleteByTabId(tabId);

        // Re-fetch tab (persistence context was cleared by @Modifying)
        OrgPhotoTab tabToDelete = getTabOrThrow(tabId, orgId);
        orgPhotoTabRepository.delete(tabToDelete);

        log.info("Photo tab deleted: tabId={}, orgId={}, userId={}, photosDeleted={}",
                tabId, orgId, userId, photos.size());
    }

    @Transactional
    @CacheEvict(value = "sharedGallery", allEntries = true)
    public void reorderTabs(String orgId, String userId, OrgPhotoRequest.TabReorder request) {
        organizationService.checkAdminOrAbove(orgId, userId);
        List<OrgPhotoTab> tabs = orgPhotoTabRepository.findByOrganizationIdOrderBySortOrder(orgId);

        Map<String, OrgPhotoTab> tabMap = tabs.stream()
                .collect(Collectors.toMap(OrgPhotoTab::getId, Function.identity()));

        for (int i = 0; i < request.getTabIds().size(); i++) {
            OrgPhotoTab tab = tabMap.get(request.getTabIds().get(i));
            if (tab != null) {
                tab.updateSortOrder(i);
            }
        }

        log.info("Photo tabs reordered: orgId={}, userId={}", orgId, userId);
    }

    // ==================== Photo Operations ====================

    public OrgPhotoResponse.PhotoPage getPhotos(String orgId, String userId, String tabId,
                                                 String cursor, int size) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        LocalDateTime cursorDateTime = null;
        if (cursor != null && !cursor.isEmpty()) {
            cursorDateTime = LocalDateTime.parse(cursor, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }

        // Fetch size+1 to determine hasNext
        Pageable pageable = PageRequest.of(0, size + 1);
        List<OrgPhoto> photos;
        long totalCount;

        if (tabId != null && !tabId.isEmpty()) {
            photos = cursorDateTime != null
                    ? orgPhotoRepository.findByTabIdAndCreatedAtBefore(tabId, cursorDateTime, pageable)
                    : orgPhotoRepository.findByTabIdOrderByCreatedAtDesc(tabId, pageable);
            // Use tab's managed photoCount instead of COUNT query
            OrgPhotoTab tab = getTabOrThrow(tabId, orgId);
            totalCount = tab.getPhotoCount();
        } else {
            photos = cursorDateTime != null
                    ? orgPhotoRepository.findByOrgIdAndCreatedAtBefore(orgId, cursorDateTime, pageable)
                    : orgPhotoRepository.findByOrgIdOrderByCreatedAtDesc(orgId, pageable);
            // Sum from tab table (lightweight) instead of COUNT on photos table
            totalCount = orgPhotoTabRepository.sumPhotoCountByOrganizationId(orgId);
        }

        boolean hasNext = photos.size() > size;
        if (hasNext) {
            photos = photos.subList(0, size);
        }

        String nextCursor = null;
        if (hasNext && !photos.isEmpty()) {
            OrgPhoto lastPhoto = photos.get(photos.size() - 1);
            nextCursor = lastPhoto.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }

        List<OrgPhotoResponse.PhotoDetail> photoDetails = photos.stream()
                .map(OrgPhotoResponse.PhotoDetail::from)
                .toList();

        return OrgPhotoResponse.PhotoPage.builder()
                .photos(photoDetails)
                .nextCursor(nextCursor)
                .hasNext(hasNext)
                .totalCount(totalCount)
                .build();
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public List<OrgPhotoResponse.PhotoDetail> uploadPhotos(String orgId, String userId, String tabId,
                                                            List<MultipartFile> files) {
        organizationService.checkAdminOrAbove(orgId, userId);

        if (files.size() > MAX_UPLOAD_FILES) {
            throw new BusinessException(ErrorCode.PHOTO_UPLOAD_LIMIT_EXCEEDED);
        }

        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        OrgPhotoTab tab = getTabOrThrow(tabId, orgId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        List<OrgPhotoResponse.PhotoDetail> results = new ArrayList<>();

        for (MultipartFile file : files) {
            // Validate file (스트림 기반 — 첫 12바이트만 읽어서 검증)
            fileUploadService.validateFile(file);

            String contentType = file.getContentType();
            String originalFilename = file.getOriginalFilename();
            String ext = MediaUtils.getExtension(originalFilename);
            String uuid = UUID.randomUUID().toString();

            // Upload original (스트림으로 직접 전송 — byte[] 메모리 로드 없음)
            String s3Key = String.format("photos/org/%s/%s/%s%s", orgId, tabId, uuid, ext);
            String url = fileUploadService.uploadDirect(file, s3Key);

            // 썸네일 비동기 생성 (백그라운드 스레드에서 처리)
            String thumbnailKey = String.format("photos/org/%s/%s/%s_thumb.jpg", orgId, tabId, uuid);
            String thumbnailUrl = fileUploadService.resolveUrl(thumbnailKey);
            asyncThumbnailService.generateAndUploadThumbnail(
                    s3Key, thumbnailKey, contentType,
                    THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT);

            OrgPhoto photo = OrgPhoto.builder()
                    .tab(tab)
                    .organization(org)
                    .s3Key(s3Key)
                    .thumbnailKey(thumbnailKey)
                    .url(url)
                    .thumbnailUrl(thumbnailUrl)
                    .originalFilename(originalFilename)
                    .fileSize(file.getSize())
                    .contentType(contentType)
                    .width(null)
                    .height(null)
                    .uploadedBy(user)
                    .build();
            orgPhotoRepository.save(photo);

            tab.incrementPhotoCount();

            results.add(OrgPhotoResponse.PhotoDetail.from(photo));
        }

        log.info("Photos uploaded: orgId={}, tabId={}, count={}, userId={}",
                orgId, tabId, files.size(), userId);
        return results;
    }

    @Transactional
    @CacheEvict(value = "sharedPhotos", allEntries = true)
    public OrgPhotoResponse.PhotoDetail updatePhoto(String orgId, String userId, String photoId,
                                                     OrgPhotoRequest.PhotoUpdate request) {
        organizationService.checkAdminOrAbove(orgId, userId);
        OrgPhoto photo = getPhotoOrThrow(photoId);

        if (!photo.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.PHOTO_NOT_FOUND);
        }

        photo.updateCaption(request.getCaption());

        log.info("Photo updated: photoId={}, orgId={}, userId={}", photoId, orgId, userId);
        return OrgPhotoResponse.PhotoDetail.from(photo);
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public void deletePhotos(String orgId, String userId, OrgPhotoRequest.BatchDelete request) {
        organizationService.checkAdminOrAbove(orgId, userId);

        List<OrgPhoto> photos = orgPhotoRepository.findAllById(request.getPhotoIds());

        for (OrgPhoto photo : photos) {
            if (!photo.getOrganization().getId().equals(orgId)) {
                continue;
            }
            deletePhotoFromS3(photo);
            photo.getTab().decrementPhotoCount();
            orgPhotoRepository.delete(photo);
        }

        log.info("Photos deleted: orgId={}, count={}, userId={}", orgId, photos.size(), userId);
    }

    public InputStream downloadPhoto(String orgId, String userId, String photoId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);
        OrgPhoto photo = getPhotoOrThrow(photoId);

        if (!photo.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.PHOTO_NOT_FOUND);
        }

        return fileUploadService.getAsStream(photo.getS3Key());
    }

    public StreamingResponseBody downloadPhotos(String orgId, String userId, OrgPhotoRequest.BatchDownload request) {
        organizationService.getOrgMemberOrThrow(orgId, userId);

        if (request.getPhotoIds().size() > MAX_BATCH_DOWNLOAD) {
            throw new BusinessException(ErrorCode.PHOTO_BATCH_DOWNLOAD_LIMIT);
        }

        List<OrgPhoto> photos = orgPhotoRepository.findAllById(request.getPhotoIds());
        // Filter to only this org's photos
        List<OrgPhoto> orgPhotos = photos.stream()
                .filter(p -> p.getOrganization().getId().equals(orgId))
                .toList();

        return outputStream -> {
            try (ZipOutputStream zipOut = new ZipOutputStream(outputStream)) {
                for (OrgPhoto photo : orgPhotos) {
                    try (InputStream is = fileUploadService.getAsStream(photo.getS3Key())) {
                        ZipEntry zipEntry = new ZipEntry(photo.getOriginalFilename());
                        zipOut.putNextEntry(zipEntry);
                        is.transferTo(zipOut);
                        zipOut.closeEntry();
                    } catch (Exception e) {
                        log.warn("Failed to add photo to zip: photoId={}, error={}",
                                photo.getId(), e.getMessage());
                    }
                }
                zipOut.finish();
            }
        };
    }

    // ==================== Sharing Operations ====================

    public OrgPhotoResponse.TabInfo enableShare(String orgId, String userId, String tabId) {
        photoShareLinkService.issue(orgId, userId, tabId, PhotoShareLink.LinkType.VIEW, null, null);
        OrgPhotoTab tab = getTabOrThrow(tabId, orgId);
        return OrgPhotoResponse.TabInfo.from(tab);
    }

    public OrgPhotoResponse.TabInfo disableShare(String orgId, String userId, String tabId) {
        photoShareLinkService.revokeAllForTab(orgId, tabId, userId, PhotoShareLink.LinkType.VIEW);
        OrgPhotoTab tab = getTabOrThrow(tabId, orgId);
        return OrgPhotoResponse.TabInfo.from(tab);
    }

    @Cacheable(value = "sharedGallery", key = "'album:' + #shareToken")
    public OrgPhotoResponse.SharedAlbumInfo getSharedAlbum(String shareToken) {
        OrgPhotoTab tab = photoShareLinkService.lookupActive(shareToken, PhotoShareLink.LinkType.VIEW)
                .map(PhotoShareLink::getTab)
                .filter(t -> t != null)
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));
        Organization org = tab.getOrganization();
        return OrgPhotoResponse.SharedAlbumInfo.builder()
                .albumName(tab.getName())
                .albumDescription(tab.getDescription())
                .photoCount(tab.getPhotoCount())
                .coverPhotoUrl(tab.getCoverPhoto() != null ? tab.getCoverPhoto().getThumbnailUrl() : null)
                .organizationName(org.getName())
                .organizationLogoUrl(org.getLogoUrl())
                .build();
    }

    @Cacheable(value = "sharedPhotos", key = "'album:' + #shareToken + ':' + (#cursor ?: 'first') + ':' + #size")
    public OrgPhotoResponse.SharedPhotoPage getSharedAlbumPhotos(String shareToken, String cursor, int size) {
        OrgPhotoTab tab = photoShareLinkService.lookupActive(shareToken, PhotoShareLink.LinkType.VIEW)
                .map(PhotoShareLink::getTab)
                .filter(t -> t != null)
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));

        LocalDateTime cursorDateTime = null;
        if (cursor != null && !cursor.isEmpty()) {
            cursorDateTime = LocalDateTime.parse(cursor, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }

        Pageable pageable = PageRequest.of(0, size + 1);
        List<OrgPhoto> photos = cursorDateTime != null
                ? orgPhotoRepository.findByTabIdAndCreatedAtBefore(tab.getId(), cursorDateTime, pageable)
                : orgPhotoRepository.findByTabIdOrderByCreatedAtDesc(tab.getId(), pageable);

        boolean hasNext = photos.size() > size;
        if (hasNext) {
            photos = photos.subList(0, size);
        }

        String nextCursor = null;
        if (hasNext && !photos.isEmpty()) {
            OrgPhoto lastPhoto = photos.get(photos.size() - 1);
            nextCursor = lastPhoto.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }

        long totalCount = tab.getPhotoCount();

        List<OrgPhotoResponse.SharedPhotoItem> items = photos.stream()
                .map(OrgPhotoResponse.SharedPhotoItem::from)
                .toList();

        return OrgPhotoResponse.SharedPhotoPage.builder()
                .photos(items)
                .nextCursor(nextCursor)
                .hasNext(hasNext)
                .totalCount(totalCount)
                .build();
    }

    // ==================== Upload Link Operations ====================

    public OrgPhotoResponse.TabInfo enableUploadLink(String orgId, String userId, String tabId) {
        photoShareLinkService.issue(orgId, userId, tabId, PhotoShareLink.LinkType.UPLOAD, 7, null);
        OrgPhotoTab tab = getTabOrThrow(tabId, orgId);
        return OrgPhotoResponse.TabInfo.from(tab);
    }

    public OrgPhotoResponse.TabInfo disableUploadLink(String orgId, String userId, String tabId) {
        photoShareLinkService.revokeAllForTab(orgId, tabId, userId, PhotoShareLink.LinkType.UPLOAD);
        OrgPhotoTab tab = getTabOrThrow(tabId, orgId);
        return OrgPhotoResponse.TabInfo.from(tab);
    }

    public OrgPhotoResponse.UploadAlbumInfo getUploadAlbumInfo(String uploadToken) {
        OrgPhotoTab tab = photoShareLinkService.lookupActive(uploadToken, PhotoShareLink.LinkType.UPLOAD)
                .map(PhotoShareLink::getTab)
                .filter(t -> t != null)
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));
        Organization org = tab.getOrganization();
        return OrgPhotoResponse.UploadAlbumInfo.builder()
                .albumName(tab.getName())
                .albumDescription(tab.getDescription())
                .organizationName(org.getName())
                .organizationLogoUrl(org.getLogoUrl())
                .expiresAt(photoShareLinkService.lookupActive(uploadToken, PhotoShareLink.LinkType.UPLOAD)
                        .map(PhotoShareLink::getExpiresAt).orElse(null))
                .build();
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public List<OrgPhotoResponse.PhotoDetail> publicUploadPhotos(String uploadToken, List<MultipartFile> files) {
        OrgPhotoTab tab = photoShareLinkService.lookupActive(uploadToken, PhotoShareLink.LinkType.UPLOAD)
                .map(PhotoShareLink::getTab)
                .filter(t -> t != null)
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));

        Organization org = tab.getOrganization();
        String orgId = org.getId();
        String tabId = tab.getId();

        List<OrgPhotoResponse.PhotoDetail> results = new ArrayList<>();

        for (MultipartFile file : files) {
            fileUploadService.validateFile(file);

            String contentType = file.getContentType();
            String originalFilename = file.getOriginalFilename();
            String ext = MediaUtils.getExtension(originalFilename);
            String uuid = UUID.randomUUID().toString();

            String s3Key = String.format("photos/org/%s/%s/%s%s", orgId, tabId, uuid, ext);
            String url = fileUploadService.uploadDirect(file, s3Key);

            String thumbnailKey = String.format("photos/org/%s/%s/%s_thumb.jpg", orgId, tabId, uuid);
            String thumbnailUrl = fileUploadService.resolveUrl(thumbnailKey);
            asyncThumbnailService.generateAndUploadThumbnail(
                    s3Key, thumbnailKey, contentType,
                    THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT);

            OrgPhoto photo = OrgPhoto.builder()
                    .tab(tab)
                    .organization(org)
                    .s3Key(s3Key)
                    .thumbnailKey(thumbnailKey)
                    .url(url)
                    .thumbnailUrl(thumbnailUrl)
                    .originalFilename(originalFilename)
                    .fileSize(file.getSize())
                    .contentType(contentType)
                    .width(null)
                    .height(null)
                    .build();
            orgPhotoRepository.save(photo);

            tab.incrementPhotoCount();

            results.add(OrgPhotoResponse.PhotoDetail.from(photo));
        }

        log.info("Public photos uploaded: orgId={}, tabId={}, count={}", orgId, tabId, files.size());
        return results;
    }

    // ==================== Gallery-Level Sharing ====================

    public String enableGalleryShare(String orgId, String userId, String title) {
        PhotoShareLink link = photoShareLinkService.issue(
                orgId, userId, null, PhotoShareLink.LinkType.VIEW, null, title);
        return link.getToken();
    }

    @Transactional
    @CacheEvict(value = "sharedGallery", allEntries = true)
    public void updateGalleryShareTitle(String orgId, String userId, String title) {
        organizationService.checkAdminOrAbove(orgId, userId);
        Organization org = organizationRepository.findActiveById(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        org.updatePhotoShareTitle(title);
        log.info("Gallery share title updated: orgId={}, userId={}", orgId, userId);
    }

    public void disableGalleryShare(String orgId, String userId) {
        photoShareLinkService.revokeAllGalleryLinks(orgId, userId, PhotoShareLink.LinkType.VIEW);
    }

    public Organization getGalleryShareOrg(String orgId) {
        return organizationRepository.findActiveById(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
    }

    @Cacheable(value = "sharedGallery", key = "'gallery:' + #shareToken")
    public OrgPhotoResponse.SharedGalleryInfo getSharedGallery(String shareToken) {
        PhotoShareLink link = photoShareLinkService.lookupActive(shareToken, PhotoShareLink.LinkType.VIEW)
                .filter(l -> l.getTab() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        Organization org = link.getOrganization();
        String galleryTitle = link.getTitle() != null ? link.getTitle() : org.getPhotoShareTitle();

        List<OrgPhotoTab> sharedTabs = orgPhotoTabRepository
                .findByOrganizationIdAndIsSharedTrueOrderBySortOrderAsc(org.getId());

        List<OrgPhotoResponse.SharedAlbumSummary> albumSummaries = sharedTabs.stream()
                .map(tab -> OrgPhotoResponse.SharedAlbumSummary.builder()
                        .id(tab.getId())
                        .name(tab.getName())
                        .description(tab.getDescription())
                        .photoCount(tab.getPhotoCount())
                        .coverPhotoUrl(tab.getCoverPhoto() != null ? tab.getCoverPhoto().getThumbnailUrl() : null)
                        .build())
                .toList();

        int totalPhotos = sharedTabs.stream().mapToInt(OrgPhotoTab::getPhotoCount).sum();

        return OrgPhotoResponse.SharedGalleryInfo.builder()
                .galleryTitle(galleryTitle)
                .organizationName(org.getName())
                .organizationLogoUrl(org.getLogoUrl())
                .albums(albumSummaries)
                .totalPhotoCount(totalPhotos)
                .build();
    }

    @Cacheable(value = "sharedPhotos", key = "'gallery:' + #shareToken + ':' + #albumId + ':' + (#cursor ?: 'first') + ':' + #size")
    public OrgPhotoResponse.SharedPhotoPage getSharedGalleryPhotos(
            String shareToken, String albumId, String cursor, int size) {
        PhotoShareLink link = photoShareLinkService.lookupActive(shareToken, PhotoShareLink.LinkType.VIEW)
                .filter(l -> l.getTab() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        Organization org = link.getOrganization();

        OrgPhotoTab tab = orgPhotoTabRepository.findById(albumId)
                .filter(t -> t.getOrganization().getId().equals(org.getId())
                        && Boolean.TRUE.equals(t.getIsShared()))
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));
        // is_shared 컬럼은 PhotoShareLinkService.syncLegacyCanonical()로 동기화되며,
        // 활성 VIEW 링크가 하나라도 있으면 true. 추가로 토큰 단위 검증을 원할 경우 lookupActive 사용 가능.

        LocalDateTime cursorDateTime = null;
        if (cursor != null && !cursor.isEmpty()) {
            cursorDateTime = LocalDateTime.parse(cursor, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }

        Pageable pageable = PageRequest.of(0, size + 1);
        List<OrgPhoto> photos = cursorDateTime != null
                ? orgPhotoRepository.findByTabIdAndCreatedAtBefore(tab.getId(), cursorDateTime, pageable)
                : orgPhotoRepository.findByTabIdOrderByCreatedAtDesc(tab.getId(), pageable);

        boolean hasNext = photos.size() > size;
        if (hasNext) {
            photos = photos.subList(0, size);
        }

        String nextCursor = null;
        if (hasNext && !photos.isEmpty()) {
            nextCursor = photos.get(photos.size() - 1).getCreatedAt()
                    .format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }

        long totalCount = tab.getPhotoCount();

        List<OrgPhotoResponse.SharedPhotoItem> items = photos.stream()
                .map(OrgPhotoResponse.SharedPhotoItem::from)
                .toList();

        return OrgPhotoResponse.SharedPhotoPage.builder()
                .photos(items)
                .nextCursor(nextCursor)
                .hasNext(hasNext)
                .totalCount(totalCount)
                .build();
    }

    // ==================== Gallery-Level Upload ====================

    public String enableGalleryUpload(String orgId, String userId) {
        PhotoShareLink link = photoShareLinkService.issue(
                orgId, userId, null, PhotoShareLink.LinkType.UPLOAD, 7, null);
        return link.getToken();
    }

    public void disableGalleryUpload(String orgId, String userId) {
        photoShareLinkService.revokeAllGalleryLinks(orgId, userId, PhotoShareLink.LinkType.UPLOAD);
    }

    public Map<String, Object> getGalleryUploadStatus(String orgId) {
        Organization org = organizationRepository.findActiveById(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        boolean enabled = org.isGalleryUploadEnabled();
        return Map.of(
                "enabled", enabled,
                "upload_token", enabled ? org.getPhotoUploadToken() : "",
                "expires_at", enabled && org.getPhotoUploadTokenExpiresAt() != null
                        ? org.getPhotoUploadTokenExpiresAt().toString() : ""
        );
    }

    public OrgPhotoResponse.GalleryUploadInfo getGalleryUploadInfo(String uploadToken) {
        PhotoShareLink link = photoShareLinkService.lookupActive(uploadToken, PhotoShareLink.LinkType.UPLOAD)
                .filter(l -> l.getTab() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        Organization org = link.getOrganization();

        List<OrgPhotoTab> tabs = orgPhotoTabRepository.findByOrganizationIdOrderBySortOrder(org.getId());

        List<OrgPhotoResponse.SharedAlbumSummary> albumSummaries = tabs.stream()
                .map(tab -> OrgPhotoResponse.SharedAlbumSummary.builder()
                        .id(tab.getId())
                        .name(tab.getName())
                        .description(tab.getDescription())
                        .photoCount(tab.getPhotoCount())
                        .coverPhotoUrl(tab.getCoverPhoto() != null ? tab.getCoverPhoto().getThumbnailUrl() : null)
                        .build())
                .toList();

        return OrgPhotoResponse.GalleryUploadInfo.builder()
                .organizationName(org.getName())
                .organizationLogoUrl(org.getLogoUrl())
                .albums(albumSummaries)
                .expiresAt(link.getExpiresAt())
                .build();
    }

    @Transactional
    public OrgPhotoResponse.SharedAlbumSummary publicGalleryCreateTab(String uploadToken, OrgPhotoRequest.TabCreate request) {
        PhotoShareLink link = photoShareLinkService.lookupActive(uploadToken, PhotoShareLink.LinkType.UPLOAD)
                .filter(l -> l.getTab() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        Organization org = link.getOrganization();

        int nextSortOrder = (int) orgPhotoTabRepository.countByOrganizationId(org.getId());

        OrgPhotoTab tab = OrgPhotoTab.builder()
                .organization(org)
                .name(request.getName())
                .description(request.getDescription())
                .sortOrder(nextSortOrder)
                .createdBy(null)
                .build();
        orgPhotoTabRepository.save(tab);

        log.info("Public gallery tab created: tabId={}, orgId={}, token={}", tab.getId(), org.getId(), uploadToken);
        return OrgPhotoResponse.SharedAlbumSummary.builder()
                .id(tab.getId())
                .name(tab.getName())
                .description(tab.getDescription())
                .photoCount(0)
                .coverPhotoUrl(null)
                .build();
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public void publicGalleryDeleteTab(String uploadToken, String albumId) {
        PhotoShareLink link = photoShareLinkService.lookupActive(uploadToken, PhotoShareLink.LinkType.UPLOAD)
                .filter(l -> l.getTab() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        Organization org = link.getOrganization();

        OrgPhotoTab tab = orgPhotoTabRepository.findByIdAndOrganizationId(albumId, org.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));

        // Delete all S3 files for photos in this tab
        List<OrgPhoto> photos = orgPhotoRepository.findByTabId(albumId);
        for (OrgPhoto photo : photos) {
            deletePhotoFromS3(photo);
        }

        // Clear cover photo reference before deleting photos
        tab.updateCoverPhoto(null);
        orgPhotoTabRepository.flush();

        // JPQL bulk delete + clearAutomatically clears persistence context
        orgPhotoRepository.deleteByTabId(albumId);

        // Re-fetch tab (persistence context was cleared by @Modifying)
        OrgPhotoTab tabToDelete = orgPhotoTabRepository.findByIdAndOrganizationId(albumId, org.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));
        orgPhotoTabRepository.delete(tabToDelete);

        log.info("Public gallery tab deleted: tabId={}, orgId={}, photosDeleted={}",
                albumId, org.getId(), photos.size());
    }

    public OrgPhotoResponse.SharedPhotoPage getGalleryUploadPhotos(
            String uploadToken, String albumId, String cursor, int size) {
        PhotoShareLink link = photoShareLinkService.lookupActive(uploadToken, PhotoShareLink.LinkType.UPLOAD)
                .filter(l -> l.getTab() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        Organization org = link.getOrganization();

        OrgPhotoTab tab = orgPhotoTabRepository.findByIdAndOrganizationId(albumId, org.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));

        LocalDateTime cursorDateTime = null;
        if (cursor != null && !cursor.isEmpty()) {
            cursorDateTime = LocalDateTime.parse(cursor, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }

        Pageable pageable = PageRequest.of(0, size + 1);
        List<OrgPhoto> photos = cursorDateTime != null
                ? orgPhotoRepository.findByTabIdAndCreatedAtBefore(tab.getId(), cursorDateTime, pageable)
                : orgPhotoRepository.findByTabIdOrderByCreatedAtDesc(tab.getId(), pageable);

        boolean hasNext = photos.size() > size;
        if (hasNext) {
            photos = photos.subList(0, size);
        }

        String nextCursor = null;
        if (hasNext && !photos.isEmpty()) {
            nextCursor = photos.get(photos.size() - 1).getCreatedAt()
                    .format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }

        long totalCount = tab.getPhotoCount();

        List<OrgPhotoResponse.SharedPhotoItem> items = photos.stream()
                .map(OrgPhotoResponse.SharedPhotoItem::from)
                .toList();

        return OrgPhotoResponse.SharedPhotoPage.builder()
                .photos(items)
                .nextCursor(nextCursor)
                .hasNext(hasNext)
                .totalCount(totalCount)
                .build();
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public List<OrgPhotoResponse.PhotoDetail> publicGalleryUploadPhotos(
            String uploadToken, String albumId, List<MultipartFile> files) {
        PhotoShareLink link = photoShareLinkService.lookupActive(uploadToken, PhotoShareLink.LinkType.UPLOAD)
                .filter(l -> l.getTab() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        Organization org = link.getOrganization();

        if (files.size() > MAX_UPLOAD_FILES) {
            throw new BusinessException(ErrorCode.PHOTO_UPLOAD_LIMIT_EXCEEDED);
        }

        OrgPhotoTab tab = orgPhotoTabRepository.findByIdAndOrganizationId(albumId, org.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));

        String orgId = org.getId();
        String tabId = tab.getId();

        List<OrgPhotoResponse.PhotoDetail> results = new ArrayList<>();

        for (MultipartFile file : files) {
            fileUploadService.validateFile(file);

            String contentType = file.getContentType();
            String originalFilename = file.getOriginalFilename();
            String ext = MediaUtils.getExtension(originalFilename);
            String uuid = UUID.randomUUID().toString();

            String s3Key = String.format("photos/org/%s/%s/%s%s", orgId, tabId, uuid, ext);
            String url = fileUploadService.uploadDirect(file, s3Key);

            String thumbnailKey = String.format("photos/org/%s/%s/%s_thumb.jpg", orgId, tabId, uuid);
            String thumbnailUrl = fileUploadService.resolveUrl(thumbnailKey);
            asyncThumbnailService.generateAndUploadThumbnail(
                    s3Key, thumbnailKey, contentType,
                    THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT);

            OrgPhoto photo = OrgPhoto.builder()
                    .tab(tab)
                    .organization(org)
                    .s3Key(s3Key)
                    .thumbnailKey(thumbnailKey)
                    .url(url)
                    .thumbnailUrl(thumbnailUrl)
                    .originalFilename(originalFilename)
                    .fileSize(file.getSize())
                    .contentType(contentType)
                    .width(null)
                    .height(null)
                    .build();
            orgPhotoRepository.save(photo);

            tab.incrementPhotoCount();

            results.add(OrgPhotoResponse.PhotoDetail.from(photo));
        }

        log.info("Public gallery photos uploaded: orgId={}, tabId={}, count={}", orgId, tabId, files.size());
        return results;
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public void publicGalleryDeletePhoto(String uploadToken, String albumId, String photoId) {
        PhotoShareLink link = photoShareLinkService.lookupActive(uploadToken, PhotoShareLink.LinkType.UPLOAD)
                .filter(l -> l.getTab() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        Organization org = link.getOrganization();

        OrgPhotoTab tab = orgPhotoTabRepository.findByIdAndOrganizationId(albumId, org.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));

        OrgPhoto photo = orgPhotoRepository.findById(photoId)
                .filter(p -> p.getTab().getId().equals(tab.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_NOT_FOUND));

        deletePhotoFromS3(photo);
        tab.decrementPhotoCount();
        orgPhotoRepository.delete(photo);

        log.info("Public gallery photo deleted: photoId={}, tabId={}, orgId={}", photoId, albumId, org.getId());
    }

    // ==================== Private Helpers ====================

    private OrgPhotoTab getTabOrThrow(String tabId, String orgId) {
        return orgPhotoTabRepository.findByIdAndOrganizationId(tabId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));
    }

    public OrgPhoto getPhoto(String orgId, String photoId) {
        OrgPhoto photo = getPhotoOrThrow(photoId);
        if (!photo.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.PHOTO_NOT_FOUND);
        }
        return photo;
    }

    private OrgPhoto getPhotoOrThrow(String photoId) {
        return orgPhotoRepository.findById(photoId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_NOT_FOUND));
    }

    private void deletePhotoFromS3(OrgPhoto photo) {
        try {
            fileUploadService.delete(photo.getS3Key());
            if (photo.getThumbnailKey() != null) {
                fileUploadService.delete(photo.getThumbnailKey());
            }
        } catch (Exception e) {
            log.warn("Failed to delete S3 file: key={}, error={}", photo.getS3Key(), e.getMessage());
        }
    }
}
