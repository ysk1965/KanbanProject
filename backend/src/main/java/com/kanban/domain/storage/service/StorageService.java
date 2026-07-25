package com.kanban.domain.storage.service;

import com.kanban.domain.storage.StorageFile;
import com.kanban.domain.storage.StorageFileRepository;
import com.kanban.domain.storage.StorageFolder;
import com.kanban.domain.storage.StorageFolderRepository;
import com.kanban.domain.storage.StorageScope;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
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
import org.springframework.transaction.annotation.Propagation;
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
 * 스코프 제네릭 스토리지 코어 서비스 (개인/보드/조직 공통).
 * 권한 검증은 {@link StoragePermissionService} 로 위임하고, 리소스 격리는 스코프 제네릭 쿼리로 수행한다.
 * 스코프별 진입점은 얇은 컨트롤러(My/Board/Org StorageController)가 스코프를 만들어 호출한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StorageService {

    private final StorageFolderRepository folderRepository;
    private final StorageFileRepository fileRepository;
    private final UserRepository userRepository;
    private final FileUploadService fileUploadService;
    private final AsyncThumbnailService asyncThumbnailService;
    private final StorageQuotaService quotaService;
    private final StoragePermissionService permissionService;
    private final BoardRepository boardRepository;

    private static final int THUMB_W = 400;
    private static final int THUMB_H = 400;

    @Value("${app.storage.max-file-size:2147483648}")
    private long storageMaxFileSize;

    public record DownloadResource(InputStream stream, String filename, String contentType) {}

    // ==================== Folder ====================

    public List<StorageResponse.FolderTree> getFolderTree(StorageScope scope, String userId) {
        permissionService.checkRead(scope, userId);
        List<StorageFolder> all = folderRepository.findAllByScopeNotDeleted(scope.typeName(), scope.scopeId());

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
    public StorageResponse.FolderTree createFolder(StorageScope scope, String userId, StorageRequest.CreateFolder request) {
        permissionService.checkWrite(scope, userId);
        User user = getUser(userId);

        StorageFolder parent = null;
        int depth = 0;
        int position;
        if (request.parentId() != null && !request.parentId().isBlank()) {
            parent = getFolderOrThrow(scope, request.parentId());
            depth = parent.getDepth() + 1;
            if (depth > StorageFolder.getMaxDepth()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "폴더 깊이는 최대 5단계입니다");
            }
            position = folderRepository.findNextChildPosition(parent.getId());
        } else {
            position = folderRepository.findNextRootPositionByScope(scope.typeName(), scope.scopeId());
        }

        StorageFolder.StorageFolderBuilder builder = StorageFolder.builder()
                .parent(parent)
                .name(request.name())
                .position(position)
                .depth(depth)
                .createdBy(user)
                .updatedBy(user);
        applyScope(builder, scope, user);
        StorageFolder folder = folderRepository.save(builder.build());

        return StorageResponse.FolderTree.of(folder, List.of());
    }

    @Transactional
    public StorageResponse.FolderTree renameFolder(StorageScope scope, String userId, String folderId, StorageRequest.RenameFolder request) {
        permissionService.checkWrite(scope, userId);
        StorageFolder folder = getFolderOrThrow(scope, folderId);
        folder.rename(request.name(), getUser(userId));
        return StorageResponse.FolderTree.of(folder, List.of());
    }

    @Transactional
    public StorageResponse.FolderTree moveFolder(StorageScope scope, String userId, String folderId, StorageRequest.MoveFolder request) {
        permissionService.checkWrite(scope, userId);
        StorageFolder folder = getFolderOrThrow(scope, folderId);

        StorageFolder newParent = null;
        int newDepth = 0;
        if (request.parentId() != null && !request.parentId().isBlank()) {
            newParent = getFolderOrThrow(scope, request.parentId());
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
                : folderRepository.findRootsByScope(scope.typeName(), scope.scopeId()));
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
    public void deleteFolder(StorageScope scope, String userId, String folderId) {
        permissionService.checkWrite(scope, userId);
        StorageFolder folder = getFolderOrThrow(scope, folderId);
        softDeleteFolderRecursive(folder, getUser(userId));
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

    public List<StorageResponse.FileItem> getFiles(StorageScope scope, String userId, String folderId) {
        permissionService.checkRead(scope, userId);
        List<StorageFile> files;
        if (folderId != null && !folderId.isBlank()) {
            getFolderOrThrow(scope, folderId);
            files = fileRepository.findByScopeAndFolderId(scope.typeName(), scope.scopeId(), folderId);
        } else {
            files = fileRepository.findRootFilesByScope(scope.typeName(), scope.scopeId());
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
    public StorageResponse.FileItem uploadFile(StorageScope scope, String userId, String folderId, MultipartFile file) {
        permissionService.checkWrite(scope, userId);
        User user = getUser(userId);

        // 스토리지는 임의 파일 타입 허용 — 타입 화이트리스트/매직바이트 검증 없이 크기 제한만 강제
        if (file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "빈 파일은 업로드할 수 없습니다");
        }
        if (file.getSize() > storageMaxFileSize) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE);
        }

        StorageFolder folder = resolveFolder(scope, folderId);
        checkQuota(scope, file.getSize());

        String ext = MediaUtils.getExtension(file.getOriginalFilename());
        String uuid = UUID.randomUUID().toString();
        String s3Key = String.format("storage/%s/%s%s", scope.keySegment(), uuid, ext);

        fileUploadService.uploadDirectNoValidation(file, s3Key);

        String contentType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";
        String thumbnailKey = maybeQueueThumbnail(s3Key, scope, uuid, contentType);

        StorageFile.StorageFileBuilder builder = StorageFile.builder()
                .folder(folder)
                .originalFilename(file.getOriginalFilename())
                .s3Key(s3Key)
                .thumbnailKey(thumbnailKey)
                .contentType(contentType)
                .fileSize(file.getSize())
                .createdBy(user);
        applyScope(builder, scope, user);
        StorageFile saved = fileRepository.save(builder.build());

        log.info("Storage file uploaded (direct): scope={}, fileId={}, size={}", scope.typeName(), saved.getId(), file.getSize());
        return toFileItem(saved);
    }

    /**
     * 보고서 자동 수집으로 이미 S3에 올라간 파일(키: {@code reports/slack/...})을 그 보드의 스토리지에 노출한다.
     * "전체 파일"에서 보이고 관리(용량 파악·정리)할 수 있게 하는 것이 목적.
     *
     * <p>설계:
     * <ul>
     *   <li><b>멱등</b>: 같은 (board, s3Key) row가 이미 있으면(사용자가 지운 것 포함) 아무것도 하지 않는다.
     *       일일·주간 보고서가 같은 S3 객체를 공유하고 재실행이 같은 키를 덮어써도 row가 중복 생성되지 않는다.</li>
     *   <li><b>quota 미강제</b>: 수집이 용량 한도로 실패하면 안 되므로 {@code checkQuota}를 호출하지 않는다.
     *       다만 생성된 row는 이후 usage 합산에는 포함된다(= 사용자에게 용량이 보인다).</li>
     *   <li><b>독립 트랜잭션</b>: {@code REQUIRES_NEW}로 호출부(보고서 생성) 트랜잭션과 분리 — 등록 실패가
     *       보고서 생성을 롤백시키지 않는다. 호출부도 예외를 삼킨다.</li>
     *   <li>{@code createdBy}는 보드 소유자로 채운다(자동 수집이라 행위자 사용자가 없음).
     *       소유자를 못 찾으면(=보드 없음) 조용히 건너뛴다.</li>
     * </ul>
     * 삭제 안전성은 {@link #hardDeleteFile}가 {@code reports/} 프리픽스 객체의 S3 삭제를 건너뛰어 보장한다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void registerReportFile(String boardId, String s3Key, String filename,
                                   String contentType, long size) {
        if (boardId == null || s3Key == null) {
            return;
        }
        if (fileRepository.findByBoardIdAndS3Key(boardId, s3Key).isPresent()) {
            return;   // 멱등: 이미 등록됨(또는 사용자가 지운 뒤 재수집)
        }
        Board board = boardRepository.findById(boardId).orElse(null);
        if (board == null || board.getOwner() == null) {
            return;   // createdBy를 채울 수 없으면 건너뛴다
        }
        StorageFile file = StorageFile.builder()
                .boardId(boardId)
                .originalFilename(filename != null && !filename.isBlank() ? filename : "report-file")
                .s3Key(s3Key)
                .contentType(contentType)
                .fileSize(Math.max(0L, size))
                .createdBy(board.getOwner())
                .build();
        fileRepository.save(file);
        log.info("Report file registered to board storage: board={}, key={}, size={}", boardId, s3Key, size);
    }

    // ==================== Upload (presigned, 대용량) ====================

    public StorageResponse.PresignResult presign(StorageScope scope, String userId, StorageRequest.Presign request) {
        permissionService.checkWrite(scope, userId);
        if (request.fileSize() > storageMaxFileSize) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE);
        }
        checkQuota(scope, request.fileSize());

        String ext = MediaUtils.getExtension(request.fileName());
        String key = String.format("storage/%s/%s%s", scope.keySegment(), UUID.randomUUID(), ext);

        FileUploadService.PresignResult presigned =
                fileUploadService.presignUploadToKey(key, request.contentType(), request.fileSize(), storageMaxFileSize);

        if (presigned == null) {
            return StorageResponse.PresignResult.builder().mode("direct").uploadUrl(null).s3Key(null).build();
        }
        return StorageResponse.PresignResult.builder()
                .mode(presigned.getMode())
                .uploadUrl(presigned.getUploadUrl())
                .s3Key(presigned.getTempKey())
                .build();
    }

    @Transactional
    public StorageResponse.FileItem confirmUpload(StorageScope scope, String userId, StorageRequest.Confirm request) {
        permissionService.checkWrite(scope, userId);
        User user = getUser(userId);

        String expectedPrefix = "storage/" + scope.keySegment() + "/";
        if (!request.s3Key().startsWith(expectedPrefix)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "잘못된 업로드 키입니다");
        }

        long actualSize = fileUploadService.probeObjectSize(request.s3Key());
        if (actualSize == -1L) {
            throw new BusinessException(ErrorCode.TEMP_FILE_NOT_FOUND);
        }
        if (actualSize > storageMaxFileSize) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE);
        }
        checkQuota(scope, actualSize);

        StorageFolder folder = resolveFolder(scope, request.folderId());
        String uuid = extractUuid(request.s3Key());
        String thumbnailKey = maybeQueueThumbnail(request.s3Key(), scope, uuid, request.contentType());

        StorageFile.StorageFileBuilder builder = StorageFile.builder()
                .folder(folder)
                .originalFilename(request.originalFilename())
                .s3Key(request.s3Key())
                .thumbnailKey(thumbnailKey)
                .contentType(request.contentType())
                .fileSize(actualSize)
                .width(request.width())
                .height(request.height())
                .createdBy(user);
        applyScope(builder, scope, user);
        StorageFile saved = fileRepository.save(builder.build());

        log.info("Storage file confirmed (presigned): scope={}, fileId={}, size={}", scope.typeName(), saved.getId(), actualSize);
        return toFileItem(saved);
    }

    // ==================== File ops ====================

    @Transactional
    public StorageResponse.FileItem moveFile(StorageScope scope, String userId, String fileId, StorageRequest.MoveFile request) {
        permissionService.checkWrite(scope, userId);
        StorageFile file = getFileOrThrow(scope, fileId);
        StorageFolder folder = resolveFolder(scope, request.folderId());
        file.moveToFolder(folder);
        return toFileItem(file);
    }

    @Transactional
    public void deleteFile(StorageScope scope, String userId, String fileId) {
        permissionService.checkWrite(scope, userId);
        StorageFile file = getFileOrThrow(scope, fileId);
        file.softDelete(getUser(userId));
    }

    public DownloadResource downloadFile(StorageScope scope, String userId, String fileId) {
        permissionService.checkRead(scope, userId);
        StorageFile file = fileRepository.findByIdAndScope(fileId, scope.typeName(), scope.scopeId())
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FILE_NOT_FOUND));
        InputStream stream = fileUploadService.getAsStream(file.getS3Key());
        return new DownloadResource(stream, file.getOriginalFilename(), file.getContentType());
    }

    // ==================== Usage ====================

    public StorageResponse.Usage getUsage(StorageScope scope, String userId) {
        permissionService.checkRead(scope, userId);
        long used = fileRepository.sumFileSizeByScope(scope.typeName(), scope.scopeId());
        StorageQuotaService.Quota quota = quotaService.resolve(scope);
        return StorageResponse.Usage.builder().used(used).quota(quota.bytes()).tier(quota.tier()).build();
    }

    public StorageResponse.UsageDetail getUsageDetail(StorageScope scope, String userId) {
        permissionService.checkRead(scope, userId);
        StorageQuotaService.Quota quota = quotaService.resolve(scope);

        long[] bytes = new long[4];   // 0=IMAGE 1=VIDEO 2=DOCUMENT 3=OTHER
        long[] counts = new long[4];
        long totalBytes = 0, totalCount = 0;

        for (Object[] row : fileRepository.aggregateByContentTypeByScope(scope.typeName(), scope.scopeId())) {
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
                .used(totalBytes).quota(quota.bytes()).tier(quota.tier())
                .fileCount(totalCount).categories(categories)
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

    public List<StorageResponse.TrashItem> getTrash(StorageScope scope, String userId) {
        permissionService.checkRead(scope, userId);
        List<StorageResponse.TrashItem> items = new ArrayList<>();
        folderRepository.findTrashByScope(scope.typeName(), scope.scopeId())
                .forEach(f -> items.add(StorageResponse.TrashItem.ofFolder(f)));
        fileRepository.findTrashByScope(scope.typeName(), scope.scopeId())
                .forEach(f -> items.add(StorageResponse.TrashItem.ofFile(f)));
        items.sort(Comparator.comparing(StorageResponse.TrashItem::deletedAt,
                Comparator.nullsLast(Comparator.reverseOrder())));
        return items;
    }

    @Transactional
    public void restoreFile(StorageScope scope, String userId, String fileId) {
        permissionService.checkWrite(scope, userId);
        StorageFile file = fileRepository.findByIdAndScope(fileId, scope.typeName(), scope.scopeId())
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FILE_NOT_FOUND));
        if (file.getFolder() != null && Boolean.TRUE.equals(file.getFolder().getIsDeleted())) {
            file.moveToFolder(null);
        }
        file.restore();
    }

    @Transactional
    public void restoreFolder(StorageScope scope, String userId, String folderId) {
        permissionService.checkWrite(scope, userId);
        StorageFolder folder = folderRepository.findByIdAndScope(folderId, scope.typeName(), scope.scopeId())
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FOLDER_NOT_FOUND));
        if (folder.getParent() != null && Boolean.TRUE.equals(folder.getParent().getIsDeleted())) {
            int rootPos = folderRepository.findNextRootPositionByScope(scope.typeName(), scope.scopeId());
            folder.moveTo(null, rootPos);
        }
        folder.restore();
        for (StorageFile file : fileRepository.findAllByFolderIdIncludingDeleted(folder.getId())) {
            if (Boolean.TRUE.equals(file.getIsDeleted())) {
                file.restore();
            }
        }
    }

    @Transactional
    public void permanentDeleteFile(StorageScope scope, String userId, String fileId) {
        permissionService.checkStrong(scope, userId);
        StorageFile file = fileRepository.findByIdAndScope(fileId, scope.typeName(), scope.scopeId())
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FILE_NOT_FOUND));
        hardDeleteFile(file);
    }

    @Transactional
    public void permanentDeleteFolder(StorageScope scope, String userId, String folderId) {
        permissionService.checkStrong(scope, userId);
        StorageFolder folder = folderRepository.findByIdAndScope(folderId, scope.typeName(), scope.scopeId())
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FOLDER_NOT_FOUND));
        hardDeleteFolderRecursive(folder);
    }

    @Transactional
    public int emptyTrash(StorageScope scope, String userId) {
        permissionService.checkStrong(scope, userId);
        int count = 0;
        for (StorageFolder folder : folderRepository.findTrashByScope(scope.typeName(), scope.scopeId())) {
            StorageFolder parent = folder.getParent();
            if (parent == null || !Boolean.TRUE.equals(parent.getIsDeleted())) {
                count += hardDeleteFolderRecursive(folder);
            }
        }
        for (StorageFile file : fileRepository.findTrashByScope(scope.typeName(), scope.scopeId())) {
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
        String key = file.getS3Key();
        // 보고서 자동 수집 파일(reports/ 프리픽스)은 일일·주간 보고서가 같은 S3 객체를 공유한다.
        // 스토리지에서 지워도 S3 객체는 남겨 보고서 이미지/영상이 깨지지 않게 한다(객체 정리는 보고서 측 책임).
        boolean reportOwned = key != null && key.startsWith("reports/");
        if (!reportOwned) {
            try {
                fileUploadService.delete(key);
                if (file.getThumbnailKey() != null) {
                    fileUploadService.delete(file.getThumbnailKey());
                }
            } catch (Exception e) {
                log.warn("Failed to delete storage object: key={}, error={}", key, e.getMessage());
            }
        }
        fileRepository.delete(file);
    }

    // ==================== Sharing ====================

    @Transactional
    public StorageResponse.FileItem enableFileShare(StorageScope scope, String userId, String fileId) {
        permissionService.checkWrite(scope, userId);
        StorageFile file = getFileOrThrow(scope, fileId);
        file.enableShare();
        return toFileItem(file);
    }

    @Transactional
    public StorageResponse.FileItem disableFileShare(StorageScope scope, String userId, String fileId) {
        permissionService.checkWrite(scope, userId);
        StorageFile file = getFileOrThrow(scope, fileId);
        file.disableShare();
        return toFileItem(file);
    }

    @Transactional
    public StorageResponse.FolderTree enableFolderShare(StorageScope scope, String userId, String folderId) {
        permissionService.checkWrite(scope, userId);
        StorageFolder folder = getFolderOrThrow(scope, folderId);
        folder.enableShare();
        return StorageResponse.FolderTree.of(folder, List.of());
    }

    @Transactional
    public StorageResponse.FolderTree disableFolderShare(StorageScope scope, String userId, String folderId) {
        permissionService.checkWrite(scope, userId);
        StorageFolder folder = getFolderOrThrow(scope, folderId);
        folder.disableShare();
        return StorageResponse.FolderTree.of(folder, List.of());
    }

    // ==================== Helpers ====================

    private void applyScope(StorageFolder.StorageFolderBuilder builder, StorageScope scope, User user) {
        switch (scope.type()) {
            case OWNER -> builder.owner(user);
            case BOARD -> builder.boardId(scope.boardId());
            case ORG -> builder.organizationId(scope.organizationId());
        }
    }

    private void applyScope(StorageFile.StorageFileBuilder builder, StorageScope scope, User user) {
        switch (scope.type()) {
            case OWNER -> builder.owner(user);
            case BOARD -> builder.boardId(scope.boardId());
            case ORG -> builder.organizationId(scope.organizationId());
        }
    }

    private void checkQuota(StorageScope scope, long addBytes) {
        long used = fileRepository.sumFileSizeByScope(scope.typeName(), scope.scopeId());
        long quota = quotaService.resolve(scope).bytes();
        if (used + addBytes > quota) {
            throw new BusinessException(ErrorCode.STORAGE_QUOTA_EXCEEDED);
        }
    }

    /** 이미지/영상만 썸네일을 비동기 생성 큐잉하고 thumbnailKey 반환. 그 외는 null. */
    private String maybeQueueThumbnail(String s3Key, StorageScope scope, String uuid, String contentType) {
        if (contentType == null
                || !(contentType.startsWith("image/") || contentType.startsWith("video/"))) {
            return null;
        }
        String thumbnailKey = String.format("storage/%s/%s_thumb.jpg", scope.keySegment(), uuid);
        asyncThumbnailService.generateAndUploadThumbnail(s3Key, thumbnailKey, contentType, THUMB_W, THUMB_H);
        return thumbnailKey;
    }

    private String extractUuid(String s3Key) {
        String name = s3Key.substring(s3Key.lastIndexOf('/') + 1);
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    private StorageFolder resolveFolder(StorageScope scope, String folderId) {
        if (folderId == null || folderId.isBlank()) {
            return null;
        }
        return getFolderOrThrow(scope, folderId);
    }

    private User getUser(String userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
    }

    private StorageFolder getFolderOrThrow(StorageScope scope, String folderId) {
        StorageFolder folder = folderRepository.findByIdAndScope(folderId, scope.typeName(), scope.scopeId())
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FOLDER_NOT_FOUND));
        if (Boolean.TRUE.equals(folder.getIsDeleted())) {
            throw new BusinessException(ErrorCode.STORAGE_FOLDER_NOT_FOUND);
        }
        return folder;
    }

    private StorageFile getFileOrThrow(StorageScope scope, String fileId) {
        StorageFile file = fileRepository.findByIdAndScope(fileId, scope.typeName(), scope.scopeId())
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
