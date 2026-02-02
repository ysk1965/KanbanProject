package com.kanban.global.service;

import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.util.ImageUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
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

    @Value("${app.file.max-size:5242880}")
    private long maxFileSize;

    @Value("${app.file.allowed-types:image/jpeg,image/png,image/gif,image/webp}")
    private List<String> allowedTypes;

    @Value("${app.file.local-dir:./uploads}")
    private String localDir;

    @Value("${app.file.upload-dir:comments}")
    private String uploadDir;

    @Value("${server.port:8080}")
    private int serverPort;

    @Value("${app.file.thumbnail.max-width:400}")
    private int thumbnailMaxWidth;

    @Value("${app.file.thumbnail.max-height:400}")
    private int thumbnailMaxHeight;

    @Value("${app.file.temp-expiry-minutes:60}")
    private int tempExpiryMinutes;

    @Override
    public void validateImageFile(MultipartFile file) {
        if (file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        if (file.getSize() > maxFileSize) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE);
        }
        String contentType = file.getContentType();
        if (contentType == null || !allowedTypes.contains(contentType)) {
            throw new BusinessException(ErrorCode.FILE_TYPE_NOT_ALLOWED);
        }
        // 매직바이트 검증
        try {
            byte[] bytes = file.getBytes();
            if (!ImageUtils.isValidImageMagicBytes(bytes, contentType)) {
                throw new BusinessException(ErrorCode.FILE_TYPE_NOT_ALLOWED);
            }
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    @Override
    public TempUploadResult uploadTemp(MultipartFile file) {
        validateImageFile(file);

        String extension = ImageUtils.getExtension(file.getOriginalFilename());
        String tempKey = String.format("temp/%s%s", UUID.randomUUID(), extension);

        try {
            Path filePath = Paths.get(localDir, tempKey);
            Files.createDirectories(filePath.getParent());
            Files.write(filePath, file.getBytes());

            String url = String.format("http://localhost:%d/uploads/%s", serverPort, tempKey);
            log.info("Temp file saved locally: {} -> {}", file.getOriginalFilename(), filePath);

            return new TempUploadResult(tempKey, url);
        } catch (IOException e) {
            log.error("Failed to save temp file locally: {}", file.getOriginalFilename(), e);
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
            byte[] fileBytes = Files.readAllBytes(tempPath);
            String extension = ImageUtils.getExtension(tempKey);

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

            // 썸네일 생성
            String thumbnailKey = permanentKey.replaceAll("\\.[^.]+$", "_thumb.jpg");
            String thumbnailUrl = "";
            try {
                byte[] thumbnailBytes = ImageUtils.generateThumbnail(fileBytes, thumbnailMaxWidth, thumbnailMaxHeight);
                Path thumbnailPath = Paths.get(localDir, thumbnailKey);
                Files.write(thumbnailPath, thumbnailBytes);
                thumbnailUrl = String.format("http://localhost:%d/uploads/%s", serverPort, thumbnailKey);
                log.info("Thumbnail generated: {}", thumbnailPath);
            } catch (Exception e) {
                log.warn("Failed to generate thumbnail for {}: {}", tempKey, e.getMessage());
                thumbnailKey = null;
            }

            String url = String.format("http://localhost:%d/uploads/%s", serverPort, permanentKey);
            log.info("File moved to permanent: {} -> {}", tempPath, permanentPath);

            return new PermanentResult(permanentKey, url, thumbnailKey, thumbnailUrl, contentType, fileBytes.length);
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
