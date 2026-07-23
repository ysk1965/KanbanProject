package com.kanban.domain.storage.service;

import com.kanban.domain.storage.StorageFile;
import com.kanban.domain.storage.StorageFileRepository;
import com.kanban.domain.storage.StorageFolder;
import com.kanban.domain.storage.StorageFolderRepository;
import com.kanban.domain.storage.dto.StorageResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.service.FileUploadService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 스토리지 공개 공유(비인증) 조회. shareCode(base62) 로만 접근하며, 공유가 켜진 리소스만 노출한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StoragePublicService {

    private final StorageFileRepository fileRepository;
    private final StorageFolderRepository folderRepository;
    private final FileUploadService fileUploadService;

    // ===== 단일 파일 공유 =====

    public StorageResponse.PublicFile getSharedFile(String shareCode) {
        StorageFile file = fileRepository.findByShareCodeAndIsSharedTrue(shareCode)
                .filter(f -> !Boolean.TRUE.equals(f.getIsDeleted()))
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FILE_NOT_FOUND));
        return toPublicFile(file);
    }

    public StorageService.DownloadResource downloadSharedFile(String shareCode) {
        StorageFile file = fileRepository.findByShareCodeAndIsSharedTrue(shareCode)
                .filter(f -> !Boolean.TRUE.equals(f.getIsDeleted()))
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FILE_NOT_FOUND));
        return new StorageService.DownloadResource(
                fileUploadService.getAsStream(file.getS3Key()),
                file.getOriginalFilename(), file.getContentType());
    }

    // ===== 폴더 공유 =====

    public StorageResponse.PublicFolder getSharedFolder(String shareCode) {
        StorageFolder folder = folderRepository.findByShareCodeAndIsSharedTrue(shareCode)
                .filter(f -> !Boolean.TRUE.equals(f.getIsDeleted()))
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FOLDER_NOT_FOUND));

        List<StorageResponse.PublicFile> files = fileRepository.findActiveByFolderId(folder.getId()).stream()
                .map(this::toPublicFile)
                .toList();

        return StorageResponse.PublicFolder.builder()
                .name(folder.getName())
                .fileCount(files.size())
                .files(files)
                .build();
    }

    public StorageService.DownloadResource downloadSharedFolderFile(String shareCode, String fileId) {
        StorageFolder folder = folderRepository.findByShareCodeAndIsSharedTrue(shareCode)
                .filter(f -> !Boolean.TRUE.equals(f.getIsDeleted()))
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FOLDER_NOT_FOUND));

        StorageFile file = fileRepository.findById(fileId)
                .filter(f -> !Boolean.TRUE.equals(f.getIsDeleted()))
                .filter(f -> f.getFolder() != null && f.getFolder().getId().equals(folder.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.STORAGE_FILE_NOT_FOUND));

        return new StorageService.DownloadResource(
                fileUploadService.getAsStream(file.getS3Key()),
                file.getOriginalFilename(), file.getContentType());
    }

    private StorageResponse.PublicFile toPublicFile(StorageFile file) {
        String url = fileUploadService.resolveUrl(file.getS3Key());
        String thumbUrl = file.getThumbnailKey() != null
                ? fileUploadService.resolveUrl(file.getThumbnailKey()) : null;
        return StorageResponse.PublicFile.builder()
                .id(file.getId())
                .originalFilename(file.getOriginalFilename())
                .contentType(file.getContentType())
                .fileSize(file.getFileSize())
                .url(url)
                .thumbnailUrl(thumbUrl)
                .isImage(file.isImage())
                .isVideo(file.isVideo())
                .build();
    }
}
