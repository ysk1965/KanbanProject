package com.kanban.domain.storage.dto;

import com.kanban.domain.storage.StorageFile;
import com.kanban.domain.storage.StorageFolder;
import lombok.Builder;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 스토리지 응답 DTO. Jackson SNAKE_CASE 전략으로 JSON 필드는 snake_case 로 직렬화된다.
 * url/thumbnailUrl 은 서비스가 s3Key 로부터 resolveUrl 로 지연 생성해 주입한다.
 */
public class StorageResponse {

    @Builder
    public record FolderTree(
            String id,
            String parentId,
            String name,
            int position,
            int depth,
            boolean isShared,
            String shareCode,
            /** 시스템이 관리하는 폴더의 키(REPORT_ROOT 등). 사용자가 만든 폴더는 null */
            String systemKey,
            /** 이 폴더를 소유한 보고서 id. 보고서 폴더가 아니면 null */
            String reportId,
            List<FolderTree> children
    ) {
        public static FolderTree of(StorageFolder folder, List<FolderTree> children) {
            return FolderTree.builder()
                    .id(folder.getId())
                    .parentId(folder.getParent() != null ? folder.getParent().getId() : null)
                    .name(folder.getName())
                    .position(folder.getPosition())
                    .depth(folder.getDepth())
                    .isShared(Boolean.TRUE.equals(folder.getIsShared()))
                    .shareCode(folder.getShareCode())
                    .systemKey(folder.getSystemKey())
                    .reportId(folder.getReportId())
                    .children(children)
                    .build();
        }
    }

    @Builder
    public record FileItem(
            String id,
            String folderId,
            String originalFilename,
            String contentType,
            long fileSize,
            String url,
            String thumbnailUrl,
            Integer width,
            Integer height,
            boolean isImage,
            boolean isVideo,
            boolean isShared,
            String shareCode,
            LocalDateTime createdAt
    ) {
        public static FileItem of(StorageFile file, String url, String thumbnailUrl) {
            return FileItem.builder()
                    .id(file.getId())
                    .folderId(file.getFolder() != null ? file.getFolder().getId() : null)
                    .originalFilename(file.getOriginalFilename())
                    .contentType(file.getContentType())
                    .fileSize(file.getFileSize())
                    .url(url)
                    .thumbnailUrl(thumbnailUrl)
                    .width(file.getWidth())
                    .height(file.getHeight())
                    .isImage(file.isImage())
                    .isVideo(file.isVideo())
                    .isShared(Boolean.TRUE.equals(file.getIsShared()))
                    .shareCode(file.getShareCode())
                    .createdAt(file.getCreatedAt())
                    .build();
        }
    }

    @Builder
    public record Usage(
            long used,
            long quota,
            String tier
    ) {}

    /** 타입별 용량 분해 (상세 보기). category: "IMAGE" | "VIDEO" | "DOCUMENT" | "OTHER" */
    @Builder
    public record CategoryUsage(
            String category,
            long bytes,
            long count
    ) {}

    @Builder
    public record UsageDetail(
            long used,
            long quota,
            String tier,
            long fileCount,
            List<CategoryUsage> categories
    ) {}

    /** presigned 발급 결과. mode="presigned" 이면 uploadUrl 로 S3 직접 PUT, "direct" 이면 multipart 업로드로 폴백. */
    @Builder
    public record PresignResult(
            String mode,
            String uploadUrl,
            String s3Key
    ) {}

    @Builder
    public record TrashItem(
            String id,
            String type,   // "FOLDER" | "FILE"
            String name,
            LocalDateTime deletedAt
    ) {
        public static TrashItem ofFolder(StorageFolder folder) {
            return TrashItem.builder()
                    .id(folder.getId()).type("FOLDER")
                    .name(folder.getName()).deletedAt(folder.getDeletedAt())
                    .build();
        }

        public static TrashItem ofFile(StorageFile file) {
            return TrashItem.builder()
                    .id(file.getId()).type("FILE")
                    .name(file.getOriginalFilename()).deletedAt(file.getDeletedAt())
                    .build();
        }
    }

    // ===== Public share =====

    @Builder
    public record PublicFile(
            String id,
            String originalFilename,
            String contentType,
            long fileSize,
            String url,
            String thumbnailUrl,
            boolean isImage,
            boolean isVideo
    ) {}

    @Builder
    public record PublicFolder(
            String name,
            int fileCount,
            List<PublicFile> files
    ) {}
}
