package com.kanban.global.service;

import com.kanban.global.util.MediaUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.IOException;

/**
 * 비동기 썸네일 생성 서비스
 * 메인 업로드 스레드를 블로킹하지 않고 백그라운드에서 썸네일을 생성합니다.
 */
@Slf4j
@Service
public class AsyncThumbnailService {

    private final FileUploadService fileUploadService;
    private final VideoThumbnailService videoThumbnailService;

    public AsyncThumbnailService(FileUploadService fileUploadService,
                                  VideoThumbnailService videoThumbnailService) {
        this.fileUploadService = fileUploadService;
        this.videoThumbnailService = videoThumbnailService;
    }

    /**
     * S3/로컬에 저장된 원본 파일로부터 비동기로 썸네일을 생성합니다.
     * moveToPermanent()에서 분리된 썸네일 생성 로직.
     */
    @Async("thumbnailExecutor")
    public void generateAndUploadThumbnail(String sourceKey, String thumbnailKey,
                                            String contentType, int maxWidth, int maxHeight) {
        try {
            byte[] originalBytes;
            try (var stream = fileUploadService.getAsStream(sourceKey)) {
                originalBytes = stream.readAllBytes();
            }

            byte[] thumbnailBytes;
            if (MediaUtils.isVideoType(contentType)) {
                String extension = MediaUtils.getExtension(sourceKey);
                thumbnailBytes = videoThumbnailService.extractThumbnail(
                        originalBytes, extension, maxWidth, maxHeight);
            } else {
                thumbnailBytes = MediaUtils.generateThumbnail(originalBytes, maxWidth, maxHeight);
            }

            if (thumbnailBytes != null && thumbnailBytes.length > 0) {
                fileUploadService.uploadDirect(thumbnailBytes, thumbnailKey, "image/jpeg");
                log.info("Async thumbnail generated: {}", thumbnailKey);
            } else {
                log.warn("Async thumbnail generation returned empty result for: {}", sourceKey);
            }
        } catch (IOException e) {
            log.warn("Async thumbnail generation failed for {}: {}", sourceKey, e.getMessage());
        } catch (Exception e) {
            log.error("Unexpected error in async thumbnail generation for {}: {}", sourceKey, e.getMessage());
        }
    }

    /**
     * byte[]로부터 직접 썸네일을 생성하여 업로드합니다.
     * OrgPhotoService 등 원본 바이트가 이미 있는 경우 사용.
     */
    @Async("thumbnailExecutor")
    public void generateAndUploadThumbnailFromBytes(byte[] originalBytes, String thumbnailKey,
                                                      String contentType, int maxWidth, int maxHeight) {
        try {
            byte[] thumbnailBytes;
            if (MediaUtils.isVideoType(contentType)) {
                thumbnailBytes = videoThumbnailService.extractThumbnail(
                        originalBytes, MediaUtils.getExtension(thumbnailKey), maxWidth, maxHeight);
            } else {
                thumbnailBytes = MediaUtils.generateThumbnail(originalBytes, maxWidth, maxHeight);
            }

            if (thumbnailBytes != null && thumbnailBytes.length > 0) {
                fileUploadService.uploadDirect(thumbnailBytes, thumbnailKey, "image/jpeg");
                log.info("Async thumbnail generated from bytes: {}", thumbnailKey);
            }
        } catch (IOException e) {
            log.warn("Async thumbnail generation from bytes failed for {}: {}", thumbnailKey, e.getMessage());
        } catch (Exception e) {
            log.error("Unexpected error in async thumbnail from bytes for {}: {}", thumbnailKey, e.getMessage());
        }
    }
}
