package com.kanban.global.service;

import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.UUID;

/**
 * 로컬 파일시스템 기반 업로드 서비스 (개발/테스트용)
 * S3가 비활성화되어 있을 때 사용됨
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
    }

    @Override
    public UploadResult upload(MultipartFile file, String boardId, String commentId) {
        validateImageFile(file);

        String extension = getExtension(file.getOriginalFilename());
        String key = String.format("%s/%s/%s/%s%s",
                uploadDir, boardId, commentId, UUID.randomUUID(), extension);

        try {
            Path filePath = Paths.get(localDir, key);
            Files.createDirectories(filePath.getParent());
            Files.write(filePath, file.getBytes());

            String url = String.format("http://localhost:%d/uploads/%s", serverPort, key);
            log.info("File saved locally: {} -> {}", file.getOriginalFilename(), filePath);

            return new UploadResult(key, url);
        } catch (IOException e) {
            log.error("Failed to save file locally: {}", file.getOriginalFilename(), e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    @Override
    public void delete(String key) {
        try {
            Path filePath = Paths.get(localDir, key);
            Files.deleteIfExists(filePath);
            log.info("Local file deleted: {}", filePath);
        } catch (Exception e) {
            log.warn("Failed to delete local file: {}", key, e);
        }
    }

    private String getExtension(String fileName) {
        if (fileName == null || !fileName.contains(".")) {
            return "";
        }
        return fileName.substring(fileName.lastIndexOf("."));
    }
}
