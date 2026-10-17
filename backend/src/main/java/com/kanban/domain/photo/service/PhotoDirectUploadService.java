package com.kanban.domain.photo.service;

import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.service.OrganizationService;
import com.kanban.domain.photo.OrgPhoto;
import com.kanban.domain.photo.OrgPhotoRepository;
import com.kanban.domain.photo.OrgPhotoTab;
import com.kanban.domain.photo.OrgPhotoTabRepository;
import com.kanban.domain.photo.PhotoShareLink;
import com.kanban.domain.photo.PhotoUploadIntent;
import com.kanban.domain.photo.PhotoUploadIntentRepository;
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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * 사진첩 대량 업로드 — 브라우저가 presigned PUT 으로 S3 에 직접 올리고, 서버는 메타데이터만 등록한다.
 *
 * <p>흐름: presign(최대 100개) → 브라우저가 원본·썸네일 PUT → confirm(최대 50개).
 * presign 시 {@link PhotoUploadIntent} 를 남기고 confirm 에서 소비한다. confirm 되지 않은 intent 는
 * {@link #cleanupExpiredIntents()} 가 S3 객체와 함께 정리한다.
 * S3 미지원(로컬) 환경에서는 mode="direct" 를 돌려주고, 클라이언트는 기존 multipart 업로드로 폴백한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PhotoDirectUploadService {

    private final OrgPhotoTabRepository orgPhotoTabRepository;
    private final OrgPhotoRepository orgPhotoRepository;
    private final PhotoUploadIntentRepository intentRepository;
    private final OrganizationService organizationService;
    private final PhotoShareLinkService photoShareLinkService;
    private final FileUploadService fileUploadService;
    private final AsyncThumbnailService asyncThumbnailService;
    private final UserRepository userRepository;

    @Value("${app.file.max-size:31457280}")
    private long maxFileSize;

    /** 사진첩 허용 타입 → 저장 확장자 (원본 파일명 확장자는 신뢰하지 않는다) */
    private static final Map<String, String> PHOTO_TYPES = Map.of(
            "image/jpeg", ".jpg",
            "image/png", ".png",
            "image/webp", ".webp",
            "image/gif", ".gif");

    private static final long INTENT_TTL_HOURS = 24;
    private static final int CLEANUP_BATCH = 200;
    private static final int THUMBNAIL_MAX_SIZE = 400;
    private static final int MAX_DIMENSION = 100_000;

    static final String REASON_UNSUPPORTED_TYPE = "UNSUPPORTED_TYPE";
    static final String REASON_FILE_TOO_LARGE = "FILE_TOO_LARGE";
    static final String REASON_OBJECT_NOT_FOUND = "OBJECT_NOT_FOUND";
    static final String REASON_INVALID_CONTENT = "INVALID_CONTENT";
    static final String REASON_UNKNOWN_KEY = "UNKNOWN_KEY";

    private record Target(Organization org, OrgPhotoTab tab, User uploader) {}

    // ==================== 관리자 (조직 사진첩) ====================

    @Transactional
    public OrgPhotoResponse.UploadPresignResult presign(String orgId, String userId,
                                                        OrgPhotoRequest.UploadPresign request) {
        return presign(resolveAdmin(orgId, userId, request.getTabId()), request.getFiles());
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public OrgPhotoResponse.UploadConfirmResult confirm(String orgId, String userId,
                                                        OrgPhotoRequest.UploadConfirm request) {
        return confirm(resolveAdmin(orgId, userId, request.getTabId()), request.getItems());
    }

    // ==================== 공개 앨범 업로드 링크 ====================

    @Transactional
    public OrgPhotoResponse.UploadPresignResult presignForTabLink(String uploadToken,
                                                                  OrgPhotoRequest.UploadPresign request) {
        return presign(resolveTabLink(uploadToken), request.getFiles());
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public OrgPhotoResponse.UploadConfirmResult confirmForTabLink(String uploadToken,
                                                                  OrgPhotoRequest.UploadConfirm request) {
        return confirm(resolveTabLink(uploadToken), request.getItems());
    }

    // ==================== 갤러리 업로드 링크 ====================

    @Transactional
    public OrgPhotoResponse.UploadPresignResult presignForGalleryLink(String uploadToken, String albumId,
                                                                      OrgPhotoRequest.UploadPresign request) {
        return presign(resolveGalleryLink(uploadToken, albumId), request.getFiles());
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "sharedGallery", allEntries = true),
            @CacheEvict(value = "sharedPhotos", allEntries = true)
    })
    public OrgPhotoResponse.UploadConfirmResult confirmForGalleryLink(String uploadToken, String albumId,
                                                                      OrgPhotoRequest.UploadConfirm request) {
        return confirm(resolveGalleryLink(uploadToken, albumId), request.getItems());
    }

    // ==================== 정리 ====================

    /** 만료된(= confirm 되지 않은) intent 의 S3 객체와 행을 지운다. 처리한 개수를 반환. */
    @Transactional
    public int cleanupExpiredIntents() {
        List<PhotoUploadIntent> expired = intentRepository.findExpired(
                LocalDateTime.now(ZoneOffset.UTC), PageRequest.of(0, CLEANUP_BATCH));
        for (PhotoUploadIntent intent : expired) {
            deleteObjects(intent);
        }
        intentRepository.deleteAll(expired);
        if (!expired.isEmpty()) {
            log.info("Expired photo upload intents cleaned: count={}", expired.size());
        }
        return expired.size();
    }

    // ==================== Core ====================

    private OrgPhotoResponse.UploadPresignResult presign(Target target, List<OrgPhotoRequest.PresignFile> files) {
        String orgId = target.org().getId();
        String tabId = target.tab().getId();
        LocalDateTime expiresAt = LocalDateTime.now(ZoneOffset.UTC).plusHours(INTENT_TTL_HOURS);

        List<OrgPhotoResponse.PresignItem> items = new ArrayList<>();
        List<OrgPhotoResponse.UploadRejected> rejected = new ArrayList<>();
        List<PhotoUploadIntent> intents = new ArrayList<>();

        for (OrgPhotoRequest.PresignFile file : files) {
            String contentType = file.getContentType().toLowerCase(Locale.ROOT);
            String ext = PHOTO_TYPES.get(contentType);
            if (ext == null) {
                rejected.add(rejected(file, REASON_UNSUPPORTED_TYPE));
                continue;
            }
            if (file.getSize() <= 0) {
                rejected.add(rejected(file, REASON_INVALID_CONTENT));
                continue;
            }
            if (file.getSize() > maxFileSize) {
                rejected.add(rejected(file, REASON_FILE_TOO_LARGE));
                continue;
            }

            String uuid = UUID.randomUUID().toString();
            String s3Key = String.format("photos/org/%s/%s/%s%s", orgId, tabId, uuid, ext);
            String thumbnailKey = String.format("photos/org/%s/%s/%s_thumb.jpg", orgId, tabId, uuid);

            FileUploadService.PresignResult original =
                    fileUploadService.presignUploadToKey(s3Key, contentType, file.getSize(), maxFileSize);
            if (original == null) {
                // S3 미지원 환경 — 클라이언트가 multipart 경로로 폴백
                return OrgPhotoResponse.UploadPresignResult.builder()
                        .mode("direct").items(List.of()).rejected(rejected).build();
            }
            FileUploadService.PresignResult thumbnail =
                    fileUploadService.presignUploadToKey(thumbnailKey, "image/jpeg", 0, maxFileSize);

            intents.add(PhotoUploadIntent.builder()
                    .s3Key(s3Key)
                    .thumbnailKey(thumbnailKey)
                    .organizationId(orgId)
                    .tabId(tabId)
                    .originalFilename(sanitizeFilename(file.getFilename()))
                    .contentType(contentType)
                    .uploadedBy(target.uploader() != null ? target.uploader().getId() : null)
                    .expiresAt(expiresAt)
                    .build());
            items.add(OrgPhotoResponse.PresignItem.builder()
                    .clientId(file.getClientId())
                    .s3Key(s3Key)
                    .uploadUrl(original.getUploadUrl())
                    .thumbnailUploadUrl(thumbnail != null ? thumbnail.getUploadUrl() : null)
                    .build());
        }

        intentRepository.saveAll(intents);
        log.info("Photo upload presigned: orgId={}, tabId={}, issued={}, rejected={}",
                orgId, tabId, items.size(), rejected.size());
        return OrgPhotoResponse.UploadPresignResult.builder()
                .mode("presigned").items(items).rejected(rejected).build();
    }

    private OrgPhotoResponse.UploadConfirmResult confirm(Target target, List<OrgPhotoRequest.ConfirmItem> items) {
        Organization org = target.org();
        OrgPhotoTab tab = target.tab();

        List<OrgPhotoResponse.ConfirmSucceeded> succeeded = new ArrayList<>();
        List<OrgPhotoResponse.ConfirmFailed> failed = new ArrayList<>();
        int created = 0;

        for (OrgPhotoRequest.ConfirmItem item : items) {
            String s3Key = item.getS3Key();
            Optional<PhotoUploadIntent> intentOpt = intentRepository.findByS3KeyForUpdate(s3Key);

            if (intentOpt.isEmpty()) {
                // 이미 confirm 된 key 의 재요청(네트워크 재시도)은 성공으로 돌려준다 — 중복 등록 없음
                Optional<OrgPhoto> existing = orgPhotoRepository.findByS3KeyAndTabId(s3Key, tab.getId());
                if (existing.isPresent()) {
                    succeeded.add(succeeded(s3Key, existing.get()));
                } else {
                    failed.add(failed(s3Key, REASON_UNKNOWN_KEY));
                }
                continue;
            }

            PhotoUploadIntent intent = intentOpt.get();
            if (!intent.getOrganizationId().equals(org.getId()) || !intent.getTabId().equals(tab.getId())) {
                failed.add(failed(s3Key, REASON_UNKNOWN_KEY));
                continue;
            }

            long actualSize = fileUploadService.probeObjectSize(s3Key);
            if (actualSize < 0) {
                // 아직 PUT 이 안 끝났거나 실패 — intent 는 남겨 두어 재시도 가능
                failed.add(failed(s3Key, REASON_OBJECT_NOT_FOUND));
                continue;
            }
            if (actualSize > maxFileSize) {
                discard(intent);
                failed.add(failed(s3Key, REASON_FILE_TOO_LARGE));
                continue;
            }
            byte[] head = fileUploadService.readHeadBytes(s3Key, 12);
            if (!MediaUtils.isValidImageMagicBytes(head, intent.getContentType())) {
                discard(intent);
                failed.add(failed(s3Key, REASON_INVALID_CONTENT));
                continue;
            }

            // 클라이언트 썸네일이 없거나 JPEG 가 아니면 서버에서 생성 (같은 key 로 덮어씀)
            boolean clientThumbnailOk = Boolean.TRUE.equals(item.getHasThumbnail())
                    && MediaUtils.isValidImageMagicBytes(
                            fileUploadService.readHeadBytes(intent.getThumbnailKey(), 12), "image/jpeg");
            if (!clientThumbnailOk) {
                asyncThumbnailService.generateAndUploadThumbnail(
                        s3Key, intent.getThumbnailKey(), intent.getContentType(),
                        THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE);
            }

            OrgPhoto photo = OrgPhoto.builder()
                    .tab(tab)
                    .organization(org)
                    .s3Key(s3Key)
                    .thumbnailKey(intent.getThumbnailKey())
                    .url(fileUploadService.resolveUrl(s3Key))
                    .thumbnailUrl(fileUploadService.resolveUrl(intent.getThumbnailKey()))
                    .originalFilename(intent.getOriginalFilename())
                    .fileSize(actualSize)
                    .contentType(intent.getContentType())
                    .width(sanitizeDimension(item.getWidth()))
                    .height(sanitizeDimension(item.getHeight()))
                    .uploadedBy(target.uploader())
                    .build();
            orgPhotoRepository.save(photo);
            intentRepository.delete(intent);
            created++;
            succeeded.add(succeeded(s3Key, photo));
        }

        if (created > 0) {
            orgPhotoTabRepository.incrementPhotoCount(tab.getId(), created);
        }
        log.info("Photo upload confirmed: orgId={}, tabId={}, created={}, failed={}",
                org.getId(), tab.getId(), created, failed.size());
        return OrgPhotoResponse.UploadConfirmResult.builder()
                .succeeded(succeeded).failed(failed).build();
    }

    // ==================== Target 해석 ====================

    private Target resolveAdmin(String orgId, String userId, String tabId) {
        organizationService.checkAdminOrAbove(orgId, userId);
        if (tabId == null || tabId.isBlank()) {
            throw new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND);
        }
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        OrgPhotoTab tab = orgPhotoTabRepository.findByIdAndOrganizationId(tabId, orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        return new Target(org, tab, user);
    }

    private Target resolveTabLink(String uploadToken) {
        OrgPhotoTab tab = photoShareLinkService.lookupActive(uploadToken, PhotoShareLink.LinkType.UPLOAD)
                .map(PhotoShareLink::getTab)
                .filter(t -> t != null)
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));
        return new Target(tab.getOrganization(), tab, null);
    }

    private Target resolveGalleryLink(String uploadToken, String albumId) {
        PhotoShareLink link = photoShareLinkService.lookupActive(uploadToken, PhotoShareLink.LinkType.UPLOAD)
                .filter(l -> l.getTab() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
        Organization org = link.getOrganization();
        OrgPhotoTab tab = orgPhotoTabRepository.findByIdAndOrganizationId(albumId, org.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));
        return new Target(org, tab, null);
    }

    // ==================== Helpers ====================

    private void discard(PhotoUploadIntent intent) {
        deleteObjects(intent);
        intentRepository.delete(intent);
    }

    private void deleteObjects(PhotoUploadIntent intent) {
        try {
            fileUploadService.delete(intent.getS3Key());
            fileUploadService.delete(intent.getThumbnailKey());
        } catch (Exception e) {
            log.warn("Failed to delete intent objects: key={}, error={}", intent.getS3Key(), e.getMessage());
        }
    }

    private static String sanitizeFilename(String filename) {
        String name = filename.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).trim();
        if (name.isEmpty()) name = "photo";
        return name.length() > 255 ? name.substring(name.length() - 255) : name;
    }

    private static Integer sanitizeDimension(Integer value) {
        return value != null && value > 0 && value <= MAX_DIMENSION ? value : null;
    }

    private static OrgPhotoResponse.UploadRejected rejected(OrgPhotoRequest.PresignFile file, String reason) {
        return OrgPhotoResponse.UploadRejected.builder().clientId(file.getClientId()).reason(reason).build();
    }

    private static OrgPhotoResponse.ConfirmSucceeded succeeded(String s3Key, OrgPhoto photo) {
        return OrgPhotoResponse.ConfirmSucceeded.builder()
                .s3Key(s3Key).photo(OrgPhotoResponse.PhotoDetail.from(photo)).build();
    }

    private static OrgPhotoResponse.ConfirmFailed failed(String s3Key, String reason) {
        return OrgPhotoResponse.ConfirmFailed.builder().s3Key(s3Key).reason(reason).build();
    }
}
