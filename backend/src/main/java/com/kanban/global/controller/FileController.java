package com.kanban.global.controller;

import com.kanban.global.service.FileUploadService;
import com.kanban.global.util.MediaUtils;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/files")
@RequiredArgsConstructor
public class FileController {

    private final FileUploadService fileUploadService;

    /**
     * Presigned URL 요청 (S3 모드에서만 동작)
     * Local 모드에서는 405 반환
     */
    @PostMapping("/presign")
    public ResponseEntity<?> presignUpload(@RequestBody PresignRequest request) {
        FileUploadService.PresignResult result = fileUploadService.presignUpload(
                request.getFileName(),
                request.getContentType(),
                request.getFileSize()
        );

        if (result == null) {
            // Local mode — presigned URL 미지원
            return ResponseEntity.ok(Map.of(
                    "mode", "direct",
                    "message", "Presigned URL not supported. Use POST /api/v1/files/upload instead."
            ));
        }

        return ResponseEntity.ok(Map.of(
                "mode", result.getMode(),
                "tempKey", result.getTempKey(),
                "uploadUrl", result.getUploadUrl()
        ));
    }

    /**
     * 직접 파일 업로드 (Local/S3 모두 지원)
     * 임시 경로에 저장하고 tempKey 반환
     */
    @PostMapping("/upload")
    public ResponseEntity<?> uploadFile(@RequestPart("file") MultipartFile file) {
        FileUploadService.TempUploadResult result = fileUploadService.uploadTemp(file);

        return ResponseEntity.ok(Map.of(
                "tempKey", result.getTempKey(),
                "previewUrl", result.getUrl()
        ));
    }

    /**
     * 노트 전용 파일 업로드 — 영구 경로에 바로 저장 (temp 경유 없음)
     */
    @PostMapping("/upload-note")
    public ResponseEntity<?> uploadNoteFile(
            @RequestPart("file") MultipartFile file,
            @RequestParam("boardId") String boardId) {
        fileUploadService.validateFile(file);

        String extension = MediaUtils.getExtension(file.getOriginalFilename());
        String key = String.format("notes/%s/%s%s", boardId, UUID.randomUUID(), extension);
        String url = fileUploadService.uploadDirect(file, key);

        return ResponseEntity.ok(Map.of("url", url));
    }

    @Getter
    @NoArgsConstructor
    public static class PresignRequest {
        private String fileName;
        private String contentType;
        private long fileSize;
    }
}
