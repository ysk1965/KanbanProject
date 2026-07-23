package com.kanban.domain.storage.service;

import com.kanban.domain.storage.StorageFile;
import com.kanban.domain.storage.StorageFileRepository;
import com.kanban.domain.storage.StorageFolder;
import com.kanban.domain.storage.StorageFolderRepository;
import com.kanban.domain.storage.dto.StorageRequest;
import com.kanban.domain.storage.dto.StorageResponse;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 개인(마이 스페이스) 스토리지 서비스. 노트의 owner-스코프 격리 + OrgPhoto 의 파일 업로드/썸네일 패턴을 결합.
 * 모든 조회/수정은 (resourceId, userId) 시그니처로 소유권을 강제한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MyStorageService {

    private final StorageFolderRepository folderRepository;
    private final StorageFileRepository fileRepository;
    private final UserRepository userRepository;
    private final FileUploadService fileUploadService;
    private final AsyncThumbnailService asyncThumbnailService;
    private final StorageQuotaService quotaService;

    private static final int THUMB_W = 400;
    private static final int THUMB_H = 400;

    /** presigned 대용량 업로드 상한 (기본 2GB). direct(multipart) 경로는 FileUploadService.validateFile 의 제한을 따른다. */
    @Value("${app.storage.max-file-size:2147483648}")
    private long storageMaxFileSize;

    // ==================== Folder ====================

    public List<StorageResponse.FolderTree> getFolderTree(String userId) {
        List<StorageFolder> all = folderRepository.findAllByOwnerUserIdNotDeleted(userId);

        Map<String, List<StorageFolder>> childrenMap = all.stream()
                .filter(f -> f.getParent() != null)
                .collect(Collectors.groupingBy(f -> f.getParent().getId()));

        return all.stream()
                .filter(f -> f.getParent() == null)
                .sorted(Comparator.comparingInt(StorageFolder::getPosition))
                .map(root -> buildTree(root, childrenMap))
                .toList();
    }

    private StorageResponse.FolderTree buildTree(StorageFolder folder, Map<String, List<StorageFolder>> childrenMap) {
        List<StorageResponse.FolderTree> children = childrenMap.getOrDefault(folder.getId(), List.of()).stream()
                .sorted(Comparator.comparingInt(StorageFolder::getPosition))
                .map(child -> buildTree(child, childrenMap))
                .toList();
        return StorageResponse.FolderTree.of(folder, children);
    }

    @Transactional
    public StorageResponse.FolderTree createFolder(String userId, StorageRequest.CreateFolder request) {
        User user = getUser(userId);

        StorageFolder parent = null;
        int depth = 0;
        int position;
        if (request.parentId() != null && !request.parentId().isBlank()) {
            parent = getFolderOrThrow(request.parentId(), userId);
            depth = parent.getDepth() + 1;
            if (depth > StorageFolder.getMaxDepth()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "폴더 깊이는 최대 5단계입니다");
            }
            position = folderRepository.findNextChildPosition(parent.getId());
        } else {
            position = folderRepository.findNextRootPositionByOwnerUserId(userId);
        }

        StorageFolder folder = StorageFolder.builder()
                .owner(user)
                .parent(parent)
                .name(request.name())
                .position(position)
                .depth(depth)
                .createdBy(user)
                .updatedBy(user)
                .build();
        folderRepository.save(folder);

        return StorageResponse.FolderTree.of(folder, List.of());
    }

    @Transactional
    public StorageResponse.FolderTree renameFolder(String userId, String folderId, StorageRequest.RenameFolder request) {
        User user = getUser(userId);
        StorageFolder folder = getFolderOrThrow(folderId, userId);
        folder.rename(request.name(), user);
        return StorageResponse.FolderTree.of(folder, List.of());
    }

    @Transactional
    public StorageResponse.FolderTree moveFolder(String userId, String folderId, StorageRequest.MoveFolder request) {
        StorageFolder folder = getFolderOrThrow(folderId, userId);

        StorageFolder newParent = null;
        int newDepth = 0;
        if (request.parentId() != null && !request.parentId().isBlank()) {
            newParent = getFolderOrThrow(request.parentId(), userId);
            if (isDescendantOrSelf(folder.getId(), request.parentId())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "하위 폴더로 이동할 수 없습니다");
            }
            newDepth = newParent.getDepth() + 1;
            int depthDelta = maxDescendantDepth(folder) - folder.getDepth();
            if (newDepth + depthDelta > StorageFolder.getMaxDepth()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "이동 시 깊이가 5단계를 초과합니다");
            }
        }

        List<StorageFolder> siblings = new ArrayList<>(newParent != null
                ? folderRepository.findChildrenByParentId(newParent.getId())
                : folderRepository.findRootsByOwnerUserId(userId));
        siblings.removeIf(f -> f.getId().equals(folderId));

        int index = request.position() != null
                ? Math.max(0, Math.min(request.position(), siblings.size()))
                : siblings.size();

        folder.moveTo(newParent, index);
        siblings.add(index, folder);
        for (int i = 0; i < siblings.size(); i++) {
            if (siblings.get(i).getPosition() != i) {
                siblings.get(i).updatePosition(i);
            }
        }
        updateDescendantDepths(folder);

        return StorageResponse.FolderTree.of(folder, List.of());
    }

    @Transactional
    public void deleteFolder(String userId, String folderId) {
        StorageFolder folder = getFolderOrThrow(folderId, userId);
        User actor = getUser(userId);
        softDeleteFolderRecursive(folder, actor);
    }

    private void softDeleteFolderRecursive(StorageFolder folder, User actor) {
        folder.softDelete(actor);
        for (StorageFile file : fileRepository.findActiveByFolderId(folder.getId())) {
            file.softDelete(actor);
        }
        for (StorageFolder child : folderRepository.findChildrenByParentId(folder.getId())) {
            softDeleteFolderRecursive(child, actor);
        }
    }

    // ==================== File listing ====================

    public List<StorageResponse.FileItem> getFiles(String userId, String folderId) {
        List<StorageFile> files;
        if (folderId != null && !folderId.isBlank()) {
            getFolderOrThrow(folderId, userId); // 소유권 확인
            files = fileRepository.findByOwnerUserIdAndFolderId(userId, folderId);
        } else {
            files = fileRepository.findRootFilesByOwnerUserId(userId);
        }
        return files.stream().map(this::toFileItem).toList();
    }

    private StorageResponse.FileItem toFileItem(StorageFile file) {
        String url = fileUploadService.resolveUrl(file.getS3Key());
        String thumbUrl = file.getThumbnailKey() != null
                ? fileUploadService.resolveUrl(file.getThumbnailKey()) : null;
        return StorageResponse.FileItem.of(file, url, thumbUrl);
    }

    // ==================== Upload (direct multipart) ====================

    @Transactional
    public StorageResponse.FileItem uploadFile(String userId, String folderId, MultipartFile file) {
        User user = getUser(userId);

        // 스토리지는 임의 파일 타입 허용 — 타입 화이트리스트/매직바이트 검증 없이 크기 제한만 강제
        if (file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "빈 파일은 업로드할 수 없습니다");
        }
        if (file.getSize() > storageMaxFileSize) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE);
        }

        StorageFolder folder = resolveFolder(folderId, userId);
        checkQuota(userId, file.getSize());

        String ext = MediaUtils.getExtension(file.getOriginalFilename());
        String uuid = UUID.randomUUID().toString();
        String s3Key = String.format("storage/%s/%s%s", userId, uuid, ext);

        fileUploadService.uploadDirectNoValidation(file, s3Key);

        String contentType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";
        String thumbnailKey = maybeQueueThumbnail(s3Key, uuid, userId, contentType);

        StorageFile saved = fileRepository.save(StorageFile.builder()
                .owner(user)
                .folder(folder)
                .originalFilename(file.getOriginalFilename())
                .s3Key(s3Key)
                .thumbnailKey(thumbnailKey)
                .contentType(contentType)
                .fileSize(file.getSize())
                .createdBy(user)
                .build());

        log.info("Storage file uploaded (direct): userId={}, fileId={}, size={}", userId, saved.getId(), file.getSize());
        return toFileItem(saved);
    }

    // ==================== Upload (presigned, 대용량) ====================

    public StorageResponse.PresignResult presign(String userId, StorageRequest.Presign request) {
        if (request.fileSize() > storageMaxFileSize) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE);
        }
        checkQuota(userId, request.fileSize());

        String ext = MediaUtils.getExtension(request.fileName());
        String key = String.format("storage/%s/%s%s", userId, UUID.randomUUID(), ext);

        FileUploadService.PresignResult presigned =
                fileUploadService.presignUploadToKey(key, request.contentType(), request.fileSize(), storageMaxFileSize);

        if (presigned == null) {
            // 로컬 등 presigned 미지원 → 클라이언트는 multipart(uploadFile) 로 폴백
            return StorageResponse.PresignResult.builder().mode("direct").uploadUrl(null).s3Key(null).build();
        }
        return StorageResponse.PresignResult.builder()
                .mode(presigned.getMode())
                .uploadUrl(presigned.getUploadUrl())
                .s3Key(presigned.getTempKey()) // presignUploadToKey 에서는 최종 key 를 그대로 담아 반환
                .build();
    }

    @Transactional
    public StorageResponse.FileItem confirmUpload(String userId, StorageRequest.Confirm request) {
        User user = getUser(userId);

        if (!request.s3Key().startsWith("storage/" + userId + "/")) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "잘못된 업로드 키입니다");
        }

        // 실제 업로드된 크기로 검증 (S3 headObject). 미지원(-1)이면 선언값 신뢰.
        long actualSize = fileUploadService.probeObjectSize(request.s3Key());
        if (actualSize == -1L) {
            throw new BusinessException(ErrorCode.TEMP_FILE_NOT_FOUND);
        }
        long effectiveSize = actualSize >= 0 ? actualSize : request.fileSize();
        if (effectiveSize > storageMaxFileSize) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE);
        }
        checkQuota(userId, effectiveSize);

        StorageFolder folder = resolveFolder(request.folderId(), userId);
        String uuid = extractUuid(request.s3Key());
        String thumbnailKey = maybeQueueThumbnail(request.s3Key(), uuid, userId, request.contentType());

        StorageFile saved = fileRepository.save(StorageFile.builder()
                .owner(user)
                .folder(folder)
                .originalFilename(request.originalFilename())
                .s3Key(request.s3Key())
                .thumbnailKey(thumbnailKey)
                .contentType(request.contentType())
                .fileSize(effectiveSize)
                .width(request.width())
                .height(request.height())
                .createdBy(user)
                .build());

        log.info("Storage file confirmed (presigned): userId={}, fileId={}, size={}", userId, saved.getId(), effectiveSize);
        return toFileItem(saved);
    }

    // ==================== File ops ====================

    @Transactional
    public StorageResponse.FileItem moveFile(String userId, String fileId, StorageRequest.MoveFile request) {
        StorageFile file = getFileOrThrow(fileId, userId);
        StorageFolder folder = resolveFolder(request.folderId(), userId);
        file.moveToFolder(folder);
        return toFileItem(file);
    }

    @Transactional
    public void deleteFile(String userId, String fileId) {
        StorageFile file = getFileOrThrow(fileId, userId);
        file.softDelete(getUser(userId));
    }

    public DownloadResource downloadFile(String userId, String fileId) {
        StorageFile file = fileRepository.findByIdAndOwnerUserId(fileId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FILE_NOT_FOUND));
        InputStream stream = fileUploadService.getAsStream(file.getS3Key());
        return new DownloadResource(stream, file.getOriginalFilename(), file.getContentType());
    }

    public record DownloadResource(InputStream stream, String filename, String contentType) {}

    // ==================== Usage ====================

    public StorageResponse.Usage getUsage(String userId) {
        long used = fileRepository.sumFileSizeByOwnerUserId(userId);
        StorageQuotaService.Quota quota = quotaService.resolve(userId);
        return StorageResponse.Usage.builder()
                .used(used).quota(quota.bytes()).tier(quota.tier())
                .build();
    }

    /** 타입별 분해가 포함된 상세 사용량 (상세 보기 모달용). */
    public StorageResponse.UsageDetail getUsageDetail(String userId) {
        StorageQuotaService.Quota quota = quotaService.resolve(userId);

        long[] bytes = new long[4];   // 0=IMAGE 1=VIDEO 2=DOCUMENT 3=OTHER
        long[] counts = new long[4];
        long totalBytes = 0, totalCount = 0;

        for (Object[] row : fileRepository.aggregateByContentType(userId)) {
            String contentType = (String) row[0];
            long count = ((Number) row[1]).longValue();
            long size = ((Number) row[2]).longValue();
            int idx = categoryIndex(contentType);
            bytes[idx] += size;
            counts[idx] += count;
            totalBytes += size;
            totalCount += count;
        }

        String[] names = {"IMAGE", "VIDEO", "DOCUMENT", "OTHER"};
        List<StorageResponse.CategoryUsage> categories = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            categories.add(StorageResponse.CategoryUsage.builder()
                    .category(names[i]).bytes(bytes[i]).count(counts[i]).build());
        }

        return StorageResponse.UsageDetail.builder()
                .used(totalBytes)
                .quota(quota.bytes())
                .tier(quota.tier())
                .fileCount(totalCount)
                .categories(categories)
                .build();
    }

    private int categoryIndex(String contentType) {
        if (contentType == null) return 3;
        if (contentType.startsWith("image/")) return 0;
        if (contentType.startsWith("video/")) return 1;
        if (contentType.equals("application/pdf")
                || contentType.startsWith("text/")
                || contentType.contains("word")
                || contentType.contains("excel")
                || contentType.contains("spreadsheet")
                || contentType.contains("powerpoint")
                || contentType.contains("presentation")
                || contentType.contains("document")) return 2;
        return 3;
    }

    // ==================== Trash ====================

    public List<StorageResponse.TrashItem> getTrash(String userId) {
        List<StorageResponse.TrashItem> items = new ArrayList<>();
        folderRepository.findTrashByOwnerUserId(userId)
                .forEach(f -> items.add(StorageResponse.TrashItem.ofFolder(f)));
        fileRepository.findTrashByOwnerUserId(userId)
                .forEach(f -> items.add(StorageResponse.TrashItem.ofFile(f)));
        items.sort(Comparator.comparing(StorageResponse.TrashItem::deletedAt,
                Comparator.nullsLast(Comparator.reverseOrder())));
        return items;
    }

    @Transactional
    public void restoreFile(String userId, String fileId) {
        StorageFile file = fileRepository.findByIdAndOwnerUserId(fileId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FILE_NOT_FOUND));
        // 부모 폴더가 삭제 상태면 루트로 복원
        if (file.getFolder() != null && Boolean.TRUE.equals(file.getFolder().getIsDeleted())) {
            file.moveToFolder(null);
        }
        file.restore();
    }

    @Transactional
    public void restoreFolder(String userId, String folderId) {
        StorageFolder folder = folderRepository.findByIdAndOwnerUserId(folderId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FOLDER_NOT_FOUND));
        if (folder.getParent() != null && Boolean.TRUE.equals(folder.getParent().getIsDeleted())) {
            int rootPos = folderRepository.findNextRootPositionByOwnerUserId(userId);
            folder.moveTo(null, rootPos);
        }
        folder.restore();
        // 직속 파일만 복원 (하위 폴더는 사용자가 개별 복원)
        for (StorageFile file : fileRepository.findAllByFolderIdIncludingDeleted(folder.getId())) {
            if (Boolean.TRUE.equals(file.getIsDeleted())) {
                file.restore();
            }
        }
    }

    @Transactional
    public void permanentDeleteFile(String userId, String fileId) {
        StorageFile file = fileRepository.findByIdAndOwnerUserId(fileId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FILE_NOT_FOUND));
        hardDeleteFile(file);
    }

    @Transactional
    public void permanentDeleteFolder(String userId, String folderId) {
        StorageFolder folder = folderRepository.findByIdAndOwnerUserId(folderId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FOLDER_NOT_FOUND));
        hardDeleteFolderRecursive(folder);
    }

    @Transactional
    public int emptyTrash(String userId) {
        int count = 0;
        for (StorageFolder folder : folderRepository.findTrashByOwnerUserId(userId)) {
            // 트리 루트만 처리 (부모도 휴지통이면 부모가 처리)
            StorageFolder parent = folder.getParent();
            if (parent == null || !Boolean.TRUE.equals(parent.getIsDeleted())) {
                count += hardDeleteFolderRecursive(folder);
            }
        }
        for (StorageFile file : fileRepository.findTrashByOwnerUserId(userId)) {
            hardDeleteFile(file);
            count++;
        }
        return count;
    }

    private int hardDeleteFolderRecursive(StorageFolder folder) {
        int count = 0;
        for (StorageFolder child : folderRepository.findAllChildrenIncludingDeleted(folder.getId())) {
            count += hardDeleteFolderRecursive(child);
        }
        for (StorageFile file : fileRepository.findAllByFolderIdIncludingDeleted(folder.getId())) {
            hardDeleteFile(file);
            count++;
        }
        folderRepository.delete(folder);
        return count + 1;
    }

    private void hardDeleteFile(StorageFile file) {
        try {
            fileUploadService.delete(file.getS3Key());
            if (file.getThumbnailKey() != null) {
                fileUploadService.delete(file.getThumbnailKey());
            }
        } catch (Exception e) {
            log.warn("Failed to delete storage object: key={}, error={}", file.getS3Key(), e.getMessage());
        }
        fileRepository.delete(file);
    }

    // ==================== Sharing ====================

    @Transactional
    public StorageResponse.FileItem enableFileShare(String userId, String fileId) {
        StorageFile file = getFileOrThrow(fileId, userId);
        file.enableShare();
        return toFileItem(file);
    }

    @Transactional
    public StorageResponse.FileItem disableFileShare(String userId, String fileId) {
        StorageFile file = getFileOrThrow(fileId, userId);
        file.disableShare();
        return toFileItem(file);
    }

    @Transactional
    public StorageResponse.FolderTree enableFolderShare(String userId, String folderId) {
        StorageFolder folder = getFolderOrThrow(folderId, userId);
        folder.enableShare();
        return StorageResponse.FolderTree.of(folder, List.of());
    }

    @Transactional
    public StorageResponse.FolderTree disableFolderShare(String userId, String folderId) {
        StorageFolder folder = getFolderOrThrow(folderId, userId);
        folder.disableShare();
        return StorageResponse.FolderTree.of(folder, List.of());
    }

    // ==================== Helpers ====================

    private void checkQuota(String userId, long addBytes) {
        long used = fileRepository.sumFileSizeByOwnerUserId(userId);
        long quota = quotaService.resolve(userId).bytes();
        if (used + addBytes > quota) {
            throw new BusinessException(ErrorCode.STORAGE_QUOTA_EXCEEDED);
        }
    }

    /** 이미지/영상만 썸네일을 비동기 생성 큐잉하고 thumbnailKey 반환. 그 외(문서·압축·임의 타입)는 null. */
    private String maybeQueueThumbnail(String s3Key, String uuid, String userId, String contentType) {
        if (contentType == null
                || !(contentType.startsWith("image/") || contentType.startsWith("video/"))) {
            return null;
        }
        String thumbnailKey = String.format("storage/%s/%s_thumb.jpg", userId, uuid);
        asyncThumbnailService.generateAndUploadThumbnail(s3Key, thumbnailKey, contentType, THUMB_W, THUMB_H);
        return thumbnailKey;
    }

    private String extractUuid(String s3Key) {
        String name = s3Key.substring(s3Key.lastIndexOf('/') + 1);
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    private StorageFolder resolveFolder(String folderId, String userId) {
        if (folderId == null || folderId.isBlank()) {
            return null;
        }
        return getFolderOrThrow(folderId, userId);
    }

    private User getUser(String userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
    }

    private StorageFolder getFolderOrThrow(String folderId, String userId) {
        StorageFolder folder = folderRepository.findByIdAndOwnerUserId(folderId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FOLDER_NOT_FOUND));
        if (Boolean.TRUE.equals(folder.getIsDeleted())) {
            throw new BusinessException(ErrorCode.STORAGE_FOLDER_NOT_FOUND);
        }
        return folder;
    }

    private StorageFile getFileOrThrow(String fileId, String userId) {
        StorageFile file = fileRepository.findByIdAndOwnerUserId(fileId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FILE_NOT_FOUND));
        if (Boolean.TRUE.equals(file.getIsDeleted())) {
            throw new BusinessException(ErrorCode.STORAGE_FILE_NOT_FOUND);
        }
        return file;
    }

    private boolean isDescendantOrSelf(String ancestorId, String targetId) {
        if (ancestorId.equals(targetId)) return true;
        for (StorageFolder child : folderRepository.findChildrenByParentId(ancestorId)) {
            if (isDescendantOrSelf(child.getId(), targetId)) return true;
        }
        return false;
    }

    private int maxDescendantDepth(StorageFolder folder) {
        List<StorageFolder> children = folderRepository.findChildrenByParentId(folder.getId());
        if (children.isEmpty()) return folder.getDepth();
        return children.stream().mapToInt(this::maxDescendantDepth).max().orElse(folder.getDepth());
    }

    private void updateDescendantDepths(StorageFolder parent) {
        for (StorageFolder child : folderRepository.findChildrenByParentId(parent.getId())) {
            child.moveTo(parent, child.getPosition());
            updateDescendantDepths(child);
        }
    }
}
