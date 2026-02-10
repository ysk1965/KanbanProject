package com.kanban.global.service;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.web.multipart.MultipartFile;

/**
 * 파일 업로드 서비스 인터페이스
 * S3FileUploadService / LocalFileUploadService가 구현
 */
public interface FileUploadService {

    /** 미디어 파일 검증 (Content-Type + 매직바이트, 이미지+영상) */
    void validateFile(MultipartFile file);

    /** 임시 경로에 파일 업로드 (presigned URL 대안) */
    TempUploadResult uploadTemp(MultipartFile file);

    /** presigned URL 생성 (S3 전용, 미지원 시 null 반환) */
    default PresignResult presignUpload(String fileName, String contentType, long fileSize) {
        return null;
    }

    /** 임시 파일 → 영구 경로 이동 + 썸네일 생성 */
    PermanentResult moveToPermanent(String tempKey, String boardId, String commentId);

    /** 파일 삭제 (영구 경로) */
    void delete(String key);

    /** 임시 파일 존재 여부 확인 */
    boolean tempFileExists(String tempKey);

    /** 만료된 임시 파일 정리 */
    void cleanupExpiredTemp();

    @Getter
    @RequiredArgsConstructor
    class TempUploadResult {
        private final String tempKey;
        private final String url;
    }

    @Getter
    @RequiredArgsConstructor
    class PresignResult {
        private final String tempKey;
        private final String uploadUrl;
        private final String mode; // "presigned" | "direct"
    }

    @Getter
    @RequiredArgsConstructor
    class PermanentResult {
        private final String s3Key;
        private final String url;
        private final String thumbnailS3Key;
        private final String thumbnailUrl;
        private final String contentType;
        private final long fileSize;
    }
}
