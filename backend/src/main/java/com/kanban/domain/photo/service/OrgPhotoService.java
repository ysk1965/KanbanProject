package com.kanban.domain.photo.service;

import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.repository.OrganizationRepository;
import com.kanban.domain.organization.service.OrganizationService;
import com.kanban.domain.photo.OrgPhoto;
import com.kanban.domain.photo.OrgPhotoRepository;
import com.kanban.domain.photo.OrgPhotoTab;
import com.kanban.domain.photo.OrgPhotoTabRepository;
import com.kanban.domain.photo.dto.OrgPhotoRequest;
import com.kanban.domain.photo.dto.OrgPhotoResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.service.FileUploadService;
import com.kanban.global.util.MediaUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
    private final UserRepository userRepository;

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

        orgPhotoRepository.deleteByTabId(tabId);
        orgPhotoTabRepository.delete(tab);

        log.info("Photo tab deleted: tabId={}, orgId={}, userId={}, photosDeleted={}",
                tabId, orgId, userId, photos.size());
    }

    @Transactional
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
            photos = orgPhotoRepository.findByTabIdWithCursor(tabId, cursorDateTime, pageable);
            totalCount = orgPhotoRepository.countByTabId(tabId);
        } else {
            photos = orgPhotoRepository.findByOrganizationIdWithCursor(orgId, cursorDateTime, pageable);
            totalCount = orgPhotoRepository.countByOrganizationId(orgId);
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
            try {
                // Validate file
                fileUploadService.validateFile(file);

                byte[] fileBytes = file.getBytes();
                String contentType = file.getContentType();
                String originalFilename = file.getOriginalFilename();
                String ext = MediaUtils.getExtension(originalFilename);
                String uuid = UUID.randomUUID().toString();

                // Upload original
                String s3Key = String.format("photos/org/%s/%s/%s%s", orgId, tabId, uuid, ext);
                String url = fileUploadService.uploadDirect(fileBytes, s3Key, contentType);

                // Generate and upload thumbnail
                String thumbnailKey = String.format("photos/org/%s/%s/%s_thumb.jpg", orgId, tabId, uuid);
                String thumbnailUrl = null;
                try {
                    byte[] thumbnailBytes = MediaUtils.generateThumbnail(fileBytes, THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_HEIGHT);
                    thumbnailUrl = fileUploadService.uploadDirect(thumbnailBytes, thumbnailKey, "image/jpeg");
                } catch (IOException e) {
                    log.warn("Failed to generate thumbnail for {}: {}", originalFilename, e.getMessage());
                    thumbnailKey = null;
                }

                // Get image dimensions
                Integer width = null;
                Integer height = null;
                try {
                    BufferedImage bufferedImage = ImageIO.read(new ByteArrayInputStream(fileBytes));
                    if (bufferedImage != null) {
                        width = bufferedImage.getWidth();
                        height = bufferedImage.getHeight();
                    }
                } catch (IOException e) {
                    log.warn("Failed to read image dimensions for {}: {}", originalFilename, e.getMessage());
                }

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
                        .width(width)
                        .height(height)
                        .uploadedBy(user)
                        .build();
                orgPhotoRepository.save(photo);

                tab.incrementPhotoCount();

                results.add(OrgPhotoResponse.PhotoDetail.from(photo));
            } catch (IOException e) {
                log.error("Failed to upload photo {}: {}", file.getOriginalFilename(), e.getMessage());
                throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
            }
        }

        log.info("Photos uploaded: orgId={}, tabId={}, count={}, userId={}",
                orgId, tabId, files.size(), userId);
        return results;
    }

    @Transactional
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

    @Transactional
    public OrgPhotoResponse.TabInfo enableShare(String orgId, String userId, String tabId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        OrgPhotoTab tab = getTabOrThrow(tabId, orgId);
        tab.enableShare();
        log.info("Photo tab share enabled: tabId={}, orgId={}, userId={}", tabId, orgId, userId);
        return OrgPhotoResponse.TabInfo.from(tab);
    }

    @Transactional
    public OrgPhotoResponse.TabInfo disableShare(String orgId, String userId, String tabId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        OrgPhotoTab tab = getTabOrThrow(tabId, orgId);
        tab.disableShare();
        log.info("Photo tab share disabled: tabId={}, orgId={}, userId={}", tabId, orgId, userId);
        return OrgPhotoResponse.TabInfo.from(tab);
    }

    public OrgPhotoResponse.SharedAlbumInfo getSharedAlbum(String shareToken) {
        OrgPhotoTab tab = orgPhotoTabRepository.findByShareTokenAndIsSharedTrue(shareToken)
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

    public OrgPhotoResponse.SharedPhotoPage getSharedAlbumPhotos(String shareToken, String cursor, int size) {
        OrgPhotoTab tab = orgPhotoTabRepository.findByShareTokenAndIsSharedTrue(shareToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));

        LocalDateTime cursorDateTime = null;
        if (cursor != null && !cursor.isEmpty()) {
            cursorDateTime = LocalDateTime.parse(cursor, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }

        Pageable pageable = PageRequest.of(0, size + 1);
        List<OrgPhoto> photos = orgPhotoRepository.findByTabIdWithCursor(tab.getId(), cursorDateTime, pageable);

        boolean hasNext = photos.size() > size;
        if (hasNext) {
            photos = photos.subList(0, size);
        }

        String nextCursor = null;
        if (hasNext && !photos.isEmpty()) {
            OrgPhoto lastPhoto = photos.get(photos.size() - 1);
            nextCursor = lastPhoto.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }

        long totalCount = orgPhotoRepository.countByTabId(tab.getId());

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

    // ==================== Gallery-Level Sharing ====================

    @Transactional
    public String enableGalleryShare(String orgId, String userId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        Organization org = organizationRepository.findActiveById(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        org.enableGalleryShare();
        log.info("Gallery share enabled: orgId={}, userId={}", orgId, userId);
        return org.getPhotoShareToken();
    }

    @Transactional
    public void disableGalleryShare(String orgId, String userId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        Organization org = organizationRepository.findActiveById(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        org.disableGalleryShare();
        log.info("Gallery share disabled: orgId={}, userId={}", orgId, userId);
    }

    public String getGalleryShareToken(String orgId) {
        Organization org = organizationRepository.findActiveById(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        return org.getPhotoShareToken();
    }

    public OrgPhotoResponse.SharedGalleryInfo getSharedGallery(String shareToken) {
        Organization org = organizationRepository.findByPhotoShareToken(shareToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));

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
                .organizationName(org.getName())
                .organizationLogoUrl(org.getLogoUrl())
                .albums(albumSummaries)
                .totalPhotoCount(totalPhotos)
                .build();
    }

    public OrgPhotoResponse.SharedPhotoPage getSharedGalleryPhotos(
            String shareToken, String albumId, String cursor, int size) {
        Organization org = organizationRepository.findByPhotoShareToken(shareToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));

        OrgPhotoTab tab = orgPhotoTabRepository.findById(albumId)
                .filter(t -> t.getOrganization().getId().equals(org.getId()) && Boolean.TRUE.equals(t.getIsShared()))
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));

        LocalDateTime cursorDateTime = null;
        if (cursor != null && !cursor.isEmpty()) {
            cursorDateTime = LocalDateTime.parse(cursor, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }

        Pageable pageable = PageRequest.of(0, size + 1);
        List<OrgPhoto> photos = orgPhotoRepository.findByTabIdWithCursor(tab.getId(), cursorDateTime, pageable);

        boolean hasNext = photos.size() > size;
        if (hasNext) {
            photos = photos.subList(0, size);
        }

        String nextCursor = null;
        if (hasNext && !photos.isEmpty()) {
            nextCursor = photos.get(photos.size() - 1).getCreatedAt()
                    .format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }

        long totalCount = orgPhotoRepository.countByTabId(tab.getId());

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
