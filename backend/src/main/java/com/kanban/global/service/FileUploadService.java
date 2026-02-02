package com.kanban.global.service;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.web.multipart.MultipartFile;

/**
 * 파일 업로드 서비스 인터페이스
 */
public interface FileUploadService {

    /** 이미지 파일 검증 */
    void validateImageFile(MultipartFile file);

    /** 파일 업로드 */
    UploadResult upload(MultipartFile file, String boardId, String commentId);

    /** 파일 삭제 */
    void delete(String key);

    @Getter
    @RequiredArgsConstructor
    class UploadResult {
        private final String s3Key;
        private final String url;
    }
}
