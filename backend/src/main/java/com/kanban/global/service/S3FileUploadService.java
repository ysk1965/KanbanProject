package com.kanban.global.service;

import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.util.ImageUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.file.s3-enabled", havingValue = "true")
public class S3FileUploadService implements FileUploadService {

    private final S3Client s3Client;
    private final S3Presigner s3Presigner;

    @Value("${app.file.max-size:5242880}")
    private long maxFileSize;

    @Value("${app.file.allowed-types:image/jpeg,image/png,image/gif,image/webp}")
    private List<String> allowedTypes;

    @Value("${app.file.s3-bucket:kanban-attachments}")
    private String bucketName;

    @Value("${app.file.cloudfront-domain:}")
    private String cloudfrontDomain;

    @Value("${app.file.upload-dir:comments}")
    private String uploadDir;

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
            PutObjectRequest putRequest = PutObjectRequest.builder()
                    .bucket(bucketName)
                    .key(tempKey)
                    .contentType(file.getContentType())
                    .contentLength(file.getSize())
                    .metadata(java.util.Map.of(
                            "original-name", file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown",
                            "content-type", file.getContentType() != null ? file.getContentType() : "application/octet-stream"
                    ))
                    .build();

            s3Client.putObject(putRequest, RequestBody.fromInputStream(file.getInputStream(), file.getSize()));

            String url = buildUrl(tempKey);
            log.info("Temp file uploaded to S3: {} -> {}", file.getOriginalFilename(), tempKey);

            return new TempUploadResult(tempKey, url);
        } catch (IOException e) {
            log.error("Failed to upload temp file: {}", file.getOriginalFilename(), e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    @Override
    public PresignResult presignUpload(String fileName, String contentType, long fileSize) {
        // 검증
        if (!allowedTypes.contains(contentType)) {
            throw new BusinessException(ErrorCode.FILE_TYPE_NOT_ALLOWED);
        }
        if (fileSize > maxFileSize) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE);
        }

        String extension = ImageUtils.getExtension(fileName);
        String tempKey = String.format("temp/%s%s", UUID.randomUUID(), extension);

        PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(10))
                .putObjectRequest(PutObjectRequest.builder()
                        .bucket(bucketName)
                        .key(tempKey)
                        .contentType(contentType)
                        .contentLength(fileSize)
                        .build())
                .build();

        PresignedPutObjectRequest presigned = s3Presigner.presignPutObject(presignRequest);
        String uploadUrl = presigned.url().toString();

        log.info("Presigned URL generated for: {} -> {}", fileName, tempKey);
        return new PresignResult(tempKey, uploadUrl, "presigned");
    }

    @Override
    public PermanentResult moveToPermanent(String tempKey, String boardId, String commentId) {
        // temp 파일 읽기
        try {
            HeadObjectResponse head = s3Client.headObject(HeadObjectRequest.builder()
                    .bucket(bucketName).key(tempKey).build());

            String contentType = head.contentType();
            long fileSize = head.contentLength();
            String extension = ImageUtils.getExtension(tempKey);

            // 영구 경로
            String permanentKey = String.format("%s/%s/%s/%s%s",
                    uploadDir, boardId, commentId, UUID.randomUUID(), extension);

            // S3 Copy
            s3Client.copyObject(CopyObjectRequest.builder()
                    .sourceBucket(bucketName).sourceKey(tempKey)
                    .destinationBucket(bucketName).destinationKey(permanentKey)
                    .build());

            // 썸네일 생성
            String thumbnailKey = permanentKey.replaceAll("\\.[^.]+$", "_thumb.jpg");
            String thumbnailUrl = "";
            try {
                ResponseInputStream<GetObjectResponse> objStream = s3Client.getObject(
                        GetObjectRequest.builder().bucket(bucketName).key(tempKey).build());
                byte[] originalBytes = objStream.readAllBytes();
                byte[] thumbnailBytes = ImageUtils.generateThumbnail(originalBytes, thumbnailMaxWidth, thumbnailMaxHeight);

                s3Client.putObject(PutObjectRequest.builder()
                        .bucket(bucketName).key(thumbnailKey)
                        .contentType("image/jpeg")
                        .contentLength((long) thumbnailBytes.length)
                        .build(), RequestBody.fromBytes(thumbnailBytes));

                thumbnailUrl = buildUrl(thumbnailKey);
                log.info("Thumbnail generated: {}", thumbnailKey);
            } catch (Exception e) {
                log.warn("Failed to generate thumbnail for {}: {}", tempKey, e.getMessage());
                thumbnailKey = null;
            }

            // temp 삭제
            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(bucketName).key(tempKey).build());

            String url = buildUrl(permanentKey);
            log.info("File moved to permanent: {} -> {}", tempKey, permanentKey);

            return new PermanentResult(permanentKey, url, thumbnailKey, thumbnailUrl, contentType, fileSize);
        } catch (NoSuchKeyException e) {
            throw new BusinessException(ErrorCode.TEMP_FILE_NOT_FOUND);
        } catch (Exception e) {
            log.error("Failed to move temp file: {}", tempKey, e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    @Override
    public void delete(String key) {
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(bucketName).key(key).build());
            // 썸네일도 삭제
            String thumbKey = key.replaceAll("\\.[^.]+$", "_thumb.jpg");
            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(bucketName).key(thumbKey).build());
            log.info("File deleted from S3: {} (+ thumbnail)", key);
        } catch (Exception e) {
            log.warn("Failed to delete from S3: {}", key, e);
        }
    }

    @Override
    public boolean tempFileExists(String tempKey) {
        try {
            s3Client.headObject(HeadObjectRequest.builder()
                    .bucket(bucketName).key(tempKey).build());
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        }
    }

    @Override
    public void cleanupExpiredTemp() {
        try {
            ListObjectsV2Request listRequest = ListObjectsV2Request.builder()
                    .bucket(bucketName).prefix("temp/").build();

            ListObjectsV2Response response = s3Client.listObjectsV2(listRequest);
            Instant cutoff = Instant.now().minus(Duration.ofMinutes(tempExpiryMinutes));

            for (S3Object obj : response.contents()) {
                if (obj.lastModified().isBefore(cutoff)) {
                    s3Client.deleteObject(DeleteObjectRequest.builder()
                            .bucket(bucketName).key(obj.key()).build());
                    log.info("Cleaned up expired temp file: {}", obj.key());
                }
            }
        } catch (Exception e) {
            log.warn("Failed to cleanup temp files: {}", e.getMessage());
        }
    }

    private String buildUrl(String key) {
        if (cloudfrontDomain != null && !cloudfrontDomain.isEmpty()) {
            return String.format("https://%s/%s", cloudfrontDomain, key);
        }
        return String.format("https://%s.s3.ap-northeast-2.amazonaws.com/%s", bucketName, key);
    }
}
