package com.kanban.global.service;

import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.util.MediaUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 로컬 파일시스템 기반 업로드 서비스 (개발/테스트용)
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "app.file.s3-enabled", havingValue = "false", matchIfMissing = true)
public class LocalFileUploadService implements FileUploadService {

    private final VideoThumbnailService videoThumbnailService;
    private final AsyncThumbnailService asyncThumbnailService;

    @Value("${app.file.max-size:31457280}")
    private long maxFileSize;

    @Value("${app.file.video.max-size:52428800}")
    private long videoMaxFileSize;

    @Value("${app.file.allowed-types:image/jpeg,image/png,image/gif,image/webp}")
    private List<String> allowedTypes;

    @Value("${app.file.local-dir:./uploads}")
    private String localDir;

    @Value("${app.file.upload-dir:comments}")
    private String uploadDir;

    @Value("${app.file.thumbnail.max-width:400}")
    private int thumbnailMaxWidth;

    @Value("${app.file.thumbnail.max-height:400}")
    private int thumbnailMaxHeight;

    @Value("${app.file.temp-expiry-minutes:60}")
    private int tempExpiryMinutes;

    public LocalFileUploadService(VideoThumbnailService videoThumbnailService,
                                    AsyncThumbnailService asyncThumbnailService) {
        this.videoThumbnailService = videoThumbnailService;
        this.asyncThumbnailService = asyncThumbnailService;
    }

    @Override
    public void validateFile(MultipartFile file) {
        if (file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        String contentType = file.getContentType();
        if (contentType == null || !allowedTypes.contains(contentType)) {
            throw new BusinessException(ErrorCode.FILE_TYPE_NOT_ALLOWED);
        }
        // 타입별 용량 제한
        long sizeLimit = MediaUtils.isVideoType(contentType) ? videoMaxFileSize : maxFileSize;
        if (file.getSize() > sizeLimit) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE);
        }
        // 매직바이트 검증 (첫 12바이트만 읽어서 검증 — 메모리 효율적)
        try (InputStream is = file.getInputStream()) {
            if (!MediaUtils.isValidMediaMagicBytes(is, contentType)) {
                throw new BusinessException(ErrorCode.FILE_TYPE_NOT_ALLOWED);
            }
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    @Override
    public TempUploadResult uploadTemp(MultipartFile file) {
        validateFile(file);

        String extension = MediaUtils.getExtension(file.getOriginalFilename());
        String tempKey = String.format("temp/%s%s", UUID.randomUUID(), extension);

        try {
            Path filePath = Paths.get(localDir, tempKey);
            Files.createDirectories(filePath.getParent());
            Files.write(filePath, file.getBytes());

            String url = String.format("/uploads/%s", tempKey);
            log.info("Temp file saved locally: {} -> {}", file.getOriginalFilename(), filePath);

            return new TempUploadResult(tempKey, url);
        } catch (IOException e) {
            log.error("Failed to save temp file locally: {}", file.getOriginalFilename(), e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    @Override
    public String uploadDirect(MultipartFile file, String key) {
        validateFile(file);
        try {
            Path filePath = Paths.get(localDir, key);
            Files.createDirectories(filePath.getParent());
            Files.write(filePath, file.getBytes());
            log.info("File uploaded directly to local: {}", filePath);
            return String.format("/uploads/%s", key);
        } catch (IOException e) {
            log.error("Failed to upload file directly: {}", key, e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    @Override
    public String uploadDirectNoValidation(MultipartFile file, String key) {
        try {
            Path filePath = Paths.get(localDir, key);
            Files.createDirectories(filePath.getParent());
            try (InputStream is = file.getInputStream()) {
                Files.copy(is, filePath, StandardCopyOption.REPLACE_EXISTING);
            }
            log.info("File uploaded (no-validation) to local: {}", filePath);
            return String.format("/uploads/%s", key);
        } catch (IOException e) {
            log.error("Failed to upload file (no-validation): {}", key, e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    @Override
    public String uploadDirect(byte[] data, String key, String contentType) {
        try {
            Path filePath = Paths.get(localDir, key);
            Files.createDirectories(filePath.getParent());
            Files.write(filePath, data);
            log.info("Byte array uploaded directly to local: {} ({} bytes)", filePath, data.length);
            return String.format("/uploads/%s", key);
        } catch (IOException e) {
            log.error("Failed to upload byte array directly: {}", key, e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    @Override
    public InputStream getAsStream(String key) {
        try {
            Path filePath = Paths.get(localDir, key);
            if (!Files.exists(filePath)) {
                throw new BusinessException(ErrorCode.ATTACHMENT_NOT_FOUND);
            }
            return new FileInputStream(filePath.toFile());
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to get stream from local: {}", key, e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    @Override
    public PermanentResult moveToPermanent(String tempKey, String boardId, String commentId) {
        Path tempPath = Paths.get(localDir, tempKey);

        if (!Files.exists(tempPath)) {
            throw new BusinessException(ErrorCode.TEMP_FILE_NOT_FOUND);
        }

        try {
            long fileSize = Files.size(tempPath);
            String extension = MediaUtils.getExtension(tempKey);

            // content type 감지
            String contentType = Files.probeContentType(tempPath);
            if (contentType == null) {
                contentType = "application/octet-stream";
            }

            // 영구 경로
            String permanentKey = String.format("%s/%s/%s/%s%s",
                    uploadDir, boardId, commentId, UUID.randomUUID(), extension);

            Path permanentPath = Paths.get(localDir, permanentKey);
            Files.createDirectories(permanentPath.getParent());
            Files.move(tempPath, permanentPath, StandardCopyOption.REPLACE_EXISTING);

            // 썸네일 비동기 생성 (이미지 vs 영상 분기, 문서는 스킵)
            String thumbnailKey = null;
            String thumbnailUrl = "";
            if (!MediaUtils.isDocumentType(contentType)) {
                thumbnailKey = permanentKey.replaceAll("\\.[^.]+$", "_thumb.jpg");
                thumbnailUrl = String.format("/uploads/%s", thumbnailKey);
                asyncThumbnailService.generateAndUploadThumbnail(
                        permanentKey, thumbnailKey, contentType,
                        thumbnailMaxWidth, thumbnailMaxHeight);
                log.info("Async thumbnail generation queued: {}", thumbnailKey);
            }

            String url = String.format("/uploads/%s", permanentKey);
            log.info("File moved to permanent: {} -> {}", tempPath, permanentPath);

            return new PermanentResult(permanentKey, url, thumbnailKey, thumbnailUrl, contentType, fileSize);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to move temp file: {}", tempKey, e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    @Override
    public void delete(String key) {
        try {
            Path filePath = Paths.get(localDir, key);
            Files.deleteIfExists(filePath);
            // 썸네일도 삭제
            String thumbKey = key.replaceAll("\\.[^.]+$", "_thumb.jpg");
            Path thumbPath = Paths.get(localDir, thumbKey);
            Files.deleteIfExists(thumbPath);
            log.info("Local file deleted: {} (+ thumbnail)", filePath);
        } catch (Exception e) {
            log.warn("Failed to delete local file: {}", key, e);
        }
    }

    @Override
    public boolean tempFileExists(String tempKey) {
        return Files.exists(Paths.get(localDir, tempKey));
    }

    @Override
    public String resolveUrl(String key) {
        if (key == null || key.isEmpty()) return "";
        return "/uploads/" + key;
    }

    @Override
    public void cleanupExpiredTemp() {
        Path tempDir = Paths.get(localDir, "temp");
        if (!Files.exists(tempDir)) return;

        try {
            Instant cutoff = Instant.now().minus(Duration.ofMinutes(tempExpiryMinutes));
            Files.walkFileTree(tempDir, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    if (attrs.lastModifiedTime().toInstant().isBefore(cutoff)) {
                        Files.delete(file);
                        log.info("Cleaned up expired temp file: {}", file);
                    }
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (Exception e) {
            log.warn("Failed to cleanup temp files: {}", e.getMessage());
        }
    }
}
