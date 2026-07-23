package com.kanban.domain.storage.controller;

import com.kanban.domain.storage.StorageScope;
import com.kanban.domain.storage.dto.StorageRequest;
import com.kanban.domain.storage.dto.StorageResponse;
import com.kanban.domain.storage.service.StorageService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 개인(마이 스페이스) 스토리지 API. 스코프는 JWT 사용자 = owner.
 */
@RestController
@RequestMapping("/api/v1/me/storage")
@RequiredArgsConstructor
public class MyStorageController {

    private final StorageService storageService;

    private StorageScope scope(UserPrincipal principal) {
        return StorageScope.owner(principal.getUserId());
    }

    // ===== Folders =====

    @GetMapping("/folders")
    public ResponseEntity<List<StorageResponse.FolderTree>> getFolders(@AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.getFolderTree(scope(p), p.getUserId()));
    }

    @PostMapping("/folders")
    public ResponseEntity<StorageResponse.FolderTree> createFolder(
            @AuthenticationPrincipal UserPrincipal p, @Valid @RequestBody StorageRequest.CreateFolder req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(storageService.createFolder(scope(p), p.getUserId(), req));
    }

    @PutMapping("/folders/{folderId}")
    public ResponseEntity<StorageResponse.FolderTree> renameFolder(
            @PathVariable String folderId, @AuthenticationPrincipal UserPrincipal p,
            @Valid @RequestBody StorageRequest.RenameFolder req) {
        return ResponseEntity.ok(storageService.renameFolder(scope(p), p.getUserId(), folderId, req));
    }

    @PutMapping("/folders/{folderId}/move")
    public ResponseEntity<StorageResponse.FolderTree> moveFolder(
            @PathVariable String folderId, @AuthenticationPrincipal UserPrincipal p,
            @Valid @RequestBody StorageRequest.MoveFolder req) {
        return ResponseEntity.ok(storageService.moveFolder(scope(p), p.getUserId(), folderId, req));
    }

    @DeleteMapping("/folders/{folderId}")
    public ResponseEntity<Map<String, String>> deleteFolder(
            @PathVariable String folderId, @AuthenticationPrincipal UserPrincipal p) {
        storageService.deleteFolder(scope(p), p.getUserId(), folderId);
        return ResponseEntity.ok(Map.of("message", "폴더가 휴지통으로 이동되었습니다"));
    }

    @PostMapping("/folders/{folderId}/share")
    public ResponseEntity<StorageResponse.FolderTree> enableFolderShare(
            @PathVariable String folderId, @AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.enableFolderShare(scope(p), p.getUserId(), folderId));
    }

    @DeleteMapping("/folders/{folderId}/share")
    public ResponseEntity<StorageResponse.FolderTree> disableFolderShare(
            @PathVariable String folderId, @AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.disableFolderShare(scope(p), p.getUserId(), folderId));
    }

    // ===== Files =====

    @GetMapping("/files")
    public ResponseEntity<List<StorageResponse.FileItem>> getFiles(
            @AuthenticationPrincipal UserPrincipal p,
            @RequestParam(value = "folder_id", required = false) String folderId) {
        return ResponseEntity.ok(storageService.getFiles(scope(p), p.getUserId(), folderId));
    }

    @PostMapping("/files")
    public ResponseEntity<StorageResponse.FileItem> uploadFile(
            @AuthenticationPrincipal UserPrincipal p,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "folder_id", required = false) String folderId) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(storageService.uploadFile(scope(p), p.getUserId(), folderId, file));
    }

    @PostMapping("/files/presign")
    public ResponseEntity<StorageResponse.PresignResult> presign(
            @AuthenticationPrincipal UserPrincipal p, @Valid @RequestBody StorageRequest.Presign req) {
        return ResponseEntity.ok(storageService.presign(scope(p), p.getUserId(), req));
    }

    @PostMapping("/files/confirm")
    public ResponseEntity<StorageResponse.FileItem> confirmUpload(
            @AuthenticationPrincipal UserPrincipal p, @Valid @RequestBody StorageRequest.Confirm req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(storageService.confirmUpload(scope(p), p.getUserId(), req));
    }

    @PutMapping("/files/{fileId}/move")
    public ResponseEntity<StorageResponse.FileItem> moveFile(
            @PathVariable String fileId, @AuthenticationPrincipal UserPrincipal p,
            @RequestBody StorageRequest.MoveFile req) {
        return ResponseEntity.ok(storageService.moveFile(scope(p), p.getUserId(), fileId, req));
    }

    @DeleteMapping("/files/{fileId}")
    public ResponseEntity<Map<String, String>> deleteFile(
            @PathVariable String fileId, @AuthenticationPrincipal UserPrincipal p) {
        storageService.deleteFile(scope(p), p.getUserId(), fileId);
        return ResponseEntity.ok(Map.of("message", "파일이 휴지통으로 이동되었습니다"));
    }

    @GetMapping("/files/{fileId}/download")
    public ResponseEntity<InputStreamResource> downloadFile(
            @PathVariable String fileId, @AuthenticationPrincipal UserPrincipal p) {
        return buildDownload(storageService.downloadFile(scope(p), p.getUserId(), fileId));
    }

    @PostMapping("/files/{fileId}/share")
    public ResponseEntity<StorageResponse.FileItem> enableFileShare(
            @PathVariable String fileId, @AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.enableFileShare(scope(p), p.getUserId(), fileId));
    }

    @DeleteMapping("/files/{fileId}/share")
    public ResponseEntity<StorageResponse.FileItem> disableFileShare(
            @PathVariable String fileId, @AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.disableFileShare(scope(p), p.getUserId(), fileId));
    }

    // ===== Usage =====

    @GetMapping("/usage")
    public ResponseEntity<StorageResponse.Usage> getUsage(@AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.getUsage(scope(p), p.getUserId()));
    }

    @GetMapping("/usage/detail")
    public ResponseEntity<StorageResponse.UsageDetail> getUsageDetail(@AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.getUsageDetail(scope(p), p.getUserId()));
    }

    // ===== Trash =====

    @GetMapping("/trash")
    public ResponseEntity<List<StorageResponse.TrashItem>> getTrash(@AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.getTrash(scope(p), p.getUserId()));
    }

    @PostMapping("/trash/files/{fileId}/restore")
    public ResponseEntity<Map<String, String>> restoreFile(
            @PathVariable String fileId, @AuthenticationPrincipal UserPrincipal p) {
        storageService.restoreFile(scope(p), p.getUserId(), fileId);
        return ResponseEntity.ok(Map.of("message", "파일이 복원되었습니다"));
    }

    @PostMapping("/trash/folders/{folderId}/restore")
    public ResponseEntity<Map<String, String>> restoreFolder(
            @PathVariable String folderId, @AuthenticationPrincipal UserPrincipal p) {
        storageService.restoreFolder(scope(p), p.getUserId(), folderId);
        return ResponseEntity.ok(Map.of("message", "폴더가 복원되었습니다"));
    }

    @DeleteMapping("/trash/files/{fileId}")
    public ResponseEntity<Map<String, String>> permanentDeleteFile(
            @PathVariable String fileId, @AuthenticationPrincipal UserPrincipal p) {
        storageService.permanentDeleteFile(scope(p), p.getUserId(), fileId);
        return ResponseEntity.ok(Map.of("message", "파일이 영구 삭제되었습니다"));
    }

    @DeleteMapping("/trash/folders/{folderId}")
    public ResponseEntity<Map<String, String>> permanentDeleteFolder(
            @PathVariable String folderId, @AuthenticationPrincipal UserPrincipal p) {
        storageService.permanentDeleteFolder(scope(p), p.getUserId(), folderId);
        return ResponseEntity.ok(Map.of("message", "폴더가 영구 삭제되었습니다"));
    }

    @DeleteMapping("/trash")
    public ResponseEntity<Map<String, Object>> emptyTrash(@AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(Map.of("deleted_count", storageService.emptyTrash(scope(p), p.getUserId())));
    }

    // ===== Helper (스코프 공통 다운로드 응답) =====

    static ResponseEntity<InputStreamResource> buildDownload(StorageService.DownloadResource resource) {
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(resource.filename() != null ? resource.filename() : "download", StandardCharsets.UTF_8)
                .build();
        MediaType mediaType = resource.contentType() != null
                ? MediaType.parseMediaType(resource.contentType())
                : MediaType.APPLICATION_OCTET_STREAM;
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(mediaType)
                .body(new InputStreamResource(resource.stream()));
    }
}
