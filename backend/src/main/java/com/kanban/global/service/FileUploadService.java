package com.kanban.global.service;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;

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

    /**
     * 지정한 최종(영구) key 로 바로 PUT 하는 presigned URL 생성 (S3 전용, 미지원 시 null 반환).
     * temp→permanent 복사 없이 클라이언트가 최종 위치에 직접 업로드한다. 대용량 파일(영상 등)에 사용.
     * maxSize 는 이 호출에 한해 적용할 용량 상한(바이트).
     */
    default PresignResult presignUploadToKey(String key, String contentType, long fileSize, long maxSize) {
        return null;
    }

    /** S3 객체의 실제 크기(바이트) 조회. 존재하지 않거나 미지원이면 -1. */
    default long probeObjectSize(String key) {
        return -1L;
    }

    /** 지정된 key 경로에 직접 업로드 (temp 단계 없음) */
    String uploadDirect(MultipartFile file, String key);

    /** byte 배열을 지정된 key 경로에 직접 업로드 (썸네일 등) */
    String uploadDirect(byte[] data, String key, String contentType);

    /** S3 key로부터 InputStream 반환 (ZIP 다운로드 등) */
    InputStream getAsStream(String key);

    /** 임시 파일 → 영구 경로 이동 + 썸네일 생성 */
    PermanentResult moveToPermanent(String tempKey, String boardId, String commentId);

    /** 파일 삭제 (영구 경로) */
    void delete(String key);

    /** 임시 파일 존재 여부 확인 */
    boolean tempFileExists(String tempKey);

    /** 만료된 임시 파일 정리 */
    void cleanupExpiredTemp();

    /** S3 key로부터 현재 설정에 맞는 URL 생성 (CloudFront/로컬) */
    String resolveUrl(String key);

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
