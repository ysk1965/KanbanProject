package com.kanban.domain.storage.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * 스토리지 요청 DTO. Jackson SNAKE_CASE 전략으로 JSON 필드는 snake_case 로 매핑된다.
 */
public class StorageRequest {

    public record CreateFolder(
            @NotBlank @Size(max = 255) String name,
            String parentId
    ) {}

    public record RenameFolder(
            @NotBlank @Size(max = 255) String name
    ) {}

    public record MoveFolder(
            String parentId,
            Integer position
    ) {}

    public record MoveFile(
            String folderId
    ) {}

    /** presigned 업로드용 — 클라이언트가 S3 로 직접 PUT 하기 전 URL 발급 요청. */
    public record Presign(
            @NotBlank String fileName,
            @NotBlank String contentType,
            @NotNull @Positive Long fileSize,
            String folderId
    ) {}

    /** presigned 업로드 완료 후 메타데이터 등록. */
    public record Confirm(
            @NotBlank String s3Key,
            String folderId,
            @NotBlank String originalFilename,
            @NotBlank String contentType,
            @NotNull @Positive Long fileSize,
            Integer width,
            Integer height
    ) {}
}
