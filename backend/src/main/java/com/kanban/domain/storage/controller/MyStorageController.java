package com.kanban.domain.storage.controller;

import com.kanban.domain.storage.dto.StorageRequest;
import com.kanban.domain.storage.dto.StorageResponse;
import com.kanban.domain.storage.service.MyStorageService;
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
 * 개인(마이 스페이스) 스토리지 API. 스코프는 JWT 사용자로 암묵 결정된다 (경로에 scope id 없음).
 * 노트 {@code MyNoteController} 의 owner-scope 미러.
 */
@RestController
@RequestMapping("/api/v1/me/storage")
@RequiredArgsConstructor
public class MyStorageController {

    private final MyStorageService storageService;

    // ===== Folders =====

    @GetMapping("/folders")
    public ResponseEntity<List<StorageResponse.FolderTree>> getFolders(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(storageService.getFolderTree(principal.getUserId()));
    }

    @PostMapping("/folders")
    public ResponseEntity<StorageResponse.FolderTree> createFolder(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody StorageRequest.CreateFolder request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(storageService.createFolder(principal.getUserId(), request));
    }

    @PutMapping("/folders/{folderId}")
    public ResponseEntity<StorageResponse.FolderTree> renameFolder(
            @PathVariable String folderId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody StorageRequest.RenameFolder request) {
        return ResponseEntity.ok(storageService.renameFolder(principal.getUserId(), folderId, request));
    }

    @PutMapping("/folders/{folderId}/move")
    public ResponseEntity<StorageResponse.FolderTree> moveFolder(
            @PathVariable String folderId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody StorageRequest.MoveFolder request) {
        return ResponseEntity.ok(storageService.moveFolder(principal.getUserId(), folderId, request));
    }

    @DeleteMapping("/folders/{folderId}")
    public ResponseEntity<Map<String, String>> deleteFolder(
            @PathVariable String folderId,
            @AuthenticationPrincipal UserPrincipal principal) {
        storageService.deleteFolder(principal.getUserId(), folderId);
        return ResponseEntity.ok(Map.of("message", "폴더가 휴지통으로 이동되었습니다"));
    }

    @PostMapping("/folders/{folderId}/share")
    public ResponseEntity<StorageResponse.FolderTree> enableFolderShare(
            @PathVariable String folderId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(storageService.enableFolderShare(principal.getUserId(), folderId));
    }

    @DeleteMapping("/folders/{folderId}/share")
    public ResponseEntity<StorageResponse.FolderTree> disableFolderShare(
            @PathVariable String folderId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(storageService.disableFolderShare(principal.getUserId(), folderId));
    }

    // ===== Files =====

    @GetMapping("/files")
    public ResponseEntity<List<StorageResponse.FileItem>> getFiles(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(value = "folder_id", required = false) String folderId) {
        return ResponseEntity.ok(storageService.getFiles(principal.getUserId(), folderId));
    }

    @PostMapping("/files")
    public ResponseEntity<StorageResponse.FileItem> uploadFile(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "folder_id", required = false) String folderId) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(storageService.uploadFile(principal.getUserId(), folderId, file));
    }

    @PostMapping("/files/presign")
    public ResponseEntity<StorageResponse.PresignResult> presign(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody StorageRequest.Presign request) {
        return ResponseEntity.ok(storageService.presign(principal.getUserId(), request));
    }

    @PostMapping("/files/confirm")
    public ResponseEntity<StorageResponse.FileItem> confirmUpload(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody StorageRequest.Confirm request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(storageService.confirmUpload(principal.getUserId(), request));
    }

    @PutMapping("/files/{fileId}/move")
    public ResponseEntity<StorageResponse.FileItem> moveFile(
            @PathVariable String fileId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody StorageRequest.MoveFile request) {
        return ResponseEntity.ok(storageService.moveFile(principal.getUserId(), fileId, request));
    }

    @DeleteMapping("/files/{fileId}")
    public ResponseEntity<Map<String, String>> deleteFile(
            @PathVariable String fileId,
            @AuthenticationPrincipal UserPrincipal principal) {
        storageService.deleteFile(principal.getUserId(), fileId);
        return ResponseEntity.ok(Map.of("message", "파일이 휴지통으로 이동되었습니다"));
    }

    @GetMapping("/files/{fileId}/download")
    public ResponseEntity<InputStreamResource> downloadFile(
            @PathVariable String fileId,
            @AuthenticationPrincipal UserPrincipal principal) {
        MyStorageService.DownloadResource resource = storageService.downloadFile(principal.getUserId(), fileId);
        return buildDownload(resource);
    }

    @PostMapping("/files/{fileId}/share")
    public ResponseEntity<StorageResponse.FileItem> enableFileShare(
            @PathVariable String fileId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(storageService.enableFileShare(principal.getUserId(), fileId));
    }

    @DeleteMapping("/files/{fileId}/share")
    public ResponseEntity<StorageResponse.FileItem> disableFileShare(
            @PathVariable String fileId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(storageService.disableFileShare(principal.getUserId(), fileId));
    }

    // ===== Usage =====

    @GetMapping("/usage")
    public ResponseEntity<StorageResponse.Usage> getUsage(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(storageService.getUsage(principal.getUserId()));
    }

    @GetMapping("/usage/detail")
    public ResponseEntity<StorageResponse.UsageDetail> getUsageDetail(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(storageService.getUsageDetail(principal.getUserId()));
    }

    // ===== Trash =====

    @GetMapping("/trash")
    public ResponseEntity<List<StorageResponse.TrashItem>> getTrash(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(storageService.getTrash(principal.getUserId()));
    }

    @PostMapping("/trash/files/{fileId}/restore")
    public ResponseEntity<Map<String, String>> restoreFile(
            @PathVariable String fileId,
            @AuthenticationPrincipal UserPrincipal principal) {
        storageService.restoreFile(principal.getUserId(), fileId);
        return ResponseEntity.ok(Map.of("message", "파일이 복원되었습니다"));
    }

    @PostMapping("/trash/folders/{folderId}/restore")
    public ResponseEntity<Map<String, String>> restoreFolder(
            @PathVariable String folderId,
            @AuthenticationPrincipal UserPrincipal principal) {
        storageService.restoreFolder(principal.getUserId(), folderId);
        return ResponseEntity.ok(Map.of("message", "폴더가 복원되었습니다"));
    }

    @DeleteMapping("/trash/files/{fileId}")
    public ResponseEntity<Map<String, String>> permanentDeleteFile(
            @PathVariable String fileId,
            @AuthenticationPrincipal UserPrincipal principal) {
        storageService.permanentDeleteFile(principal.getUserId(), fileId);
        return ResponseEntity.ok(Map.of("message", "파일이 영구 삭제되었습니다"));
    }

    @DeleteMapping("/trash/folders/{folderId}")
    public ResponseEntity<Map<String, String>> permanentDeleteFolder(
            @PathVariable String folderId,
            @AuthenticationPrincipal UserPrincipal principal) {
        storageService.permanentDeleteFolder(principal.getUserId(), folderId);
        return ResponseEntity.ok(Map.of("message", "폴더가 영구 삭제되었습니다"));
    }

    @DeleteMapping("/trash")
    public ResponseEntity<Map<String, Object>> emptyTrash(
            @AuthenticationPrincipal UserPrincipal principal) {
        int deleted = storageService.emptyTrash(principal.getUserId());
        return ResponseEntity.ok(Map.of("deleted_count", deleted));
    }

    // ===== Helper =====

    static ResponseEntity<InputStreamResource> buildDownload(MyStorageService.DownloadResource resource) {
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
