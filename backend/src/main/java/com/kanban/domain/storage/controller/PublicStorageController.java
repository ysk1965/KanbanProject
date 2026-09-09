package com.kanban.domain.storage.controller;

import com.kanban.domain.storage.dto.StorageResponse;
import com.kanban.domain.storage.service.StorageService;
import com.kanban.domain.storage.service.StoragePublicService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 스토리지 공개 공유(비인증) API. {@code /api/v1/public/**} 는 SecurityConfig 에서 permitAll.
 * shareCode(base62) 로만 접근하며 공유가 켜진 리소스만 노출.
 */
@RestController
@RequestMapping("/api/v1/public/storage")
@RequiredArgsConstructor
public class PublicStorageController {

    private final StoragePublicService publicService;

    // 단일 파일 공유
    @GetMapping("/files/{shareCode}")
    public ResponseEntity<StorageResponse.PublicFile> getSharedFile(@PathVariable String shareCode) {
        return ResponseEntity.ok(publicService.getSharedFile(shareCode));
    }

    /** presigned GET 이 가능하면 S3 로 302 리다이렉트, 아니면(로컬) 백엔드 스트리밍. */
    @GetMapping("/files/{shareCode}/download")
    public ResponseEntity<InputStreamResource> downloadSharedFile(@PathVariable String shareCode) {
        String presigned = publicService.sharedFileDownloadUrl(shareCode);
        if (presigned != null) return redirect(presigned);
        StorageService.DownloadResource resource = publicService.downloadSharedFile(shareCode);
        return MyStorageController.buildDownload(resource);
    }

    // 폴더 공유
    @GetMapping("/folders/{shareCode}")
    public ResponseEntity<StorageResponse.PublicFolder> getSharedFolder(@PathVariable String shareCode) {
        return ResponseEntity.ok(publicService.getSharedFolder(shareCode));
    }

    @GetMapping("/folders/{shareCode}/files/{fileId}/download")
    public ResponseEntity<InputStreamResource> downloadSharedFolderFile(
            @PathVariable String shareCode, @PathVariable String fileId) {
        String presigned = publicService.sharedFolderFileDownloadUrl(shareCode, fileId);
        if (presigned != null) return redirect(presigned);
        StorageService.DownloadResource resource = publicService.downloadSharedFolderFile(shareCode, fileId);
        return MyStorageController.buildDownload(resource);
    }

    private static ResponseEntity<InputStreamResource> redirect(String url) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, url)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .build();
    }
}
