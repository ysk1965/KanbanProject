package com.kanban.domain.storage.controller;

import com.kanban.domain.storage.StorageScope;
import com.kanban.domain.storage.dto.StorageRequest;
import com.kanban.domain.storage.dto.StorageResponse;
import com.kanban.domain.storage.service.StorageService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * 조직 스코프 스토리지 API. 권한: 조회·수정=조직 멤버, 영구삭제=admin+ ({@code StoragePermissionService}).
 */
@RestController
@RequestMapping("/api/v1/organizations/{orgId}/storage")
@RequiredArgsConstructor
public class OrgStorageController {

    private final StorageService storageService;

    private StorageScope scope(String orgId) {
        return StorageScope.org(orgId);
    }

    // ===== Folders =====

    @GetMapping("/folders")
    public ResponseEntity<List<StorageResponse.FolderTree>> getFolders(
            @PathVariable String orgId, @AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.getFolderTree(scope(orgId), p.getUserId()));
    }

    @PostMapping("/folders")
    public ResponseEntity<StorageResponse.FolderTree> createFolder(
            @PathVariable String orgId, @AuthenticationPrincipal UserPrincipal p,
            @Valid @RequestBody StorageRequest.CreateFolder req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(storageService.createFolder(scope(orgId), p.getUserId(), req));
    }

    @PutMapping("/folders/{folderId}")
    public ResponseEntity<StorageResponse.FolderTree> renameFolder(
            @PathVariable String orgId, @PathVariable String folderId,
            @AuthenticationPrincipal UserPrincipal p, @Valid @RequestBody StorageRequest.RenameFolder req) {
        return ResponseEntity.ok(storageService.renameFolder(scope(orgId), p.getUserId(), folderId, req));
    }

    @PutMapping("/folders/{folderId}/move")
    public ResponseEntity<StorageResponse.FolderTree> moveFolder(
            @PathVariable String orgId, @PathVariable String folderId,
            @AuthenticationPrincipal UserPrincipal p, @Valid @RequestBody StorageRequest.MoveFolder req) {
        return ResponseEntity.ok(storageService.moveFolder(scope(orgId), p.getUserId(), folderId, req));
    }

    @DeleteMapping("/folders/{folderId}")
    public ResponseEntity<Map<String, String>> deleteFolder(
            @PathVariable String orgId, @PathVariable String folderId, @AuthenticationPrincipal UserPrincipal p) {
        storageService.deleteFolder(scope(orgId), p.getUserId(), folderId);
        return ResponseEntity.ok(Map.of("message", "폴더가 휴지통으로 이동되었습니다"));
    }

    @PostMapping("/folders/{folderId}/share")
    public ResponseEntity<StorageResponse.FolderTree> enableFolderShare(
            @PathVariable String orgId, @PathVariable String folderId, @AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.enableFolderShare(scope(orgId), p.getUserId(), folderId));
    }

    @DeleteMapping("/folders/{folderId}/share")
    public ResponseEntity<StorageResponse.FolderTree> disableFolderShare(
            @PathVariable String orgId, @PathVariable String folderId, @AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.disableFolderShare(scope(orgId), p.getUserId(), folderId));
    }

    // ===== Files =====

    @GetMapping("/files")
    public ResponseEntity<List<StorageResponse.FileItem>> getFiles(
            @PathVariable String orgId, @AuthenticationPrincipal UserPrincipal p,
            @RequestParam(value = "folder_id", required = false) String folderId) {
        return ResponseEntity.ok(storageService.getFiles(scope(orgId), p.getUserId(), folderId));
    }

    @PostMapping("/files")
    public ResponseEntity<StorageResponse.FileItem> uploadFile(
            @PathVariable String orgId, @AuthenticationPrincipal UserPrincipal p,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "folder_id", required = false) String folderId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(storageService.uploadFile(scope(orgId), p.getUserId(), folderId, file));
    }

    @PostMapping("/files/presign")
    public ResponseEntity<StorageResponse.PresignResult> presign(
            @PathVariable String orgId, @AuthenticationPrincipal UserPrincipal p,
            @Valid @RequestBody StorageRequest.Presign req) {
        return ResponseEntity.ok(storageService.presign(scope(orgId), p.getUserId(), req));
    }

    @PostMapping("/files/confirm")
    public ResponseEntity<StorageResponse.FileItem> confirmUpload(
            @PathVariable String orgId, @AuthenticationPrincipal UserPrincipal p,
            @Valid @RequestBody StorageRequest.Confirm req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(storageService.confirmUpload(scope(orgId), p.getUserId(), req));
    }

    @PutMapping("/files/{fileId}/move")
    public ResponseEntity<StorageResponse.FileItem> moveFile(
            @PathVariable String orgId, @PathVariable String fileId,
            @AuthenticationPrincipal UserPrincipal p, @RequestBody StorageRequest.MoveFile req) {
        return ResponseEntity.ok(storageService.moveFile(scope(orgId), p.getUserId(), fileId, req));
    }

    @DeleteMapping("/files/{fileId}")
    public ResponseEntity<Map<String, String>> deleteFile(
            @PathVariable String orgId, @PathVariable String fileId, @AuthenticationPrincipal UserPrincipal p) {
        storageService.deleteFile(scope(orgId), p.getUserId(), fileId);
        return ResponseEntity.ok(Map.of("message", "파일이 휴지통으로 이동되었습니다"));
    }

    @GetMapping("/files/{fileId}/download")
    public ResponseEntity<InputStreamResource> downloadFile(
            @PathVariable String orgId, @PathVariable String fileId, @AuthenticationPrincipal UserPrincipal p) {
        return MyStorageController.buildDownload(storageService.downloadFile(scope(orgId), p.getUserId(), fileId));
    }

    @PostMapping("/files/{fileId}/share")
    public ResponseEntity<StorageResponse.FileItem> enableFileShare(
            @PathVariable String orgId, @PathVariable String fileId, @AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.enableFileShare(scope(orgId), p.getUserId(), fileId));
    }

    @DeleteMapping("/files/{fileId}/share")
    public ResponseEntity<StorageResponse.FileItem> disableFileShare(
            @PathVariable String orgId, @PathVariable String fileId, @AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.disableFileShare(scope(orgId), p.getUserId(), fileId));
    }

    // ===== Usage =====

    @GetMapping("/usage")
    public ResponseEntity<StorageResponse.Usage> getUsage(
            @PathVariable String orgId, @AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.getUsage(scope(orgId), p.getUserId()));
    }

    @GetMapping("/usage/detail")
    public ResponseEntity<StorageResponse.UsageDetail> getUsageDetail(
            @PathVariable String orgId, @AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.getUsageDetail(scope(orgId), p.getUserId()));
    }

    // ===== Trash =====

    @GetMapping("/trash")
    public ResponseEntity<List<StorageResponse.TrashItem>> getTrash(
            @PathVariable String orgId, @AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(storageService.getTrash(scope(orgId), p.getUserId()));
    }

    @PostMapping("/trash/files/{fileId}/restore")
    public ResponseEntity<Map<String, String>> restoreFile(
            @PathVariable String orgId, @PathVariable String fileId, @AuthenticationPrincipal UserPrincipal p) {
        storageService.restoreFile(scope(orgId), p.getUserId(), fileId);
        return ResponseEntity.ok(Map.of("message", "파일이 복원되었습니다"));
    }

    @PostMapping("/trash/folders/{folderId}/restore")
    public ResponseEntity<Map<String, String>> restoreFolder(
            @PathVariable String orgId, @PathVariable String folderId, @AuthenticationPrincipal UserPrincipal p) {
        storageService.restoreFolder(scope(orgId), p.getUserId(), folderId);
        return ResponseEntity.ok(Map.of("message", "폴더가 복원되었습니다"));
    }

    @DeleteMapping("/trash/files/{fileId}")
    public ResponseEntity<Map<String, String>> permanentDeleteFile(
            @PathVariable String orgId, @PathVariable String fileId, @AuthenticationPrincipal UserPrincipal p) {
        storageService.permanentDeleteFile(scope(orgId), p.getUserId(), fileId);
        return ResponseEntity.ok(Map.of("message", "파일이 영구 삭제되었습니다"));
    }

    @DeleteMapping("/trash/folders/{folderId}")
    public ResponseEntity<Map<String, String>> permanentDeleteFolder(
            @PathVariable String orgId, @PathVariable String folderId, @AuthenticationPrincipal UserPrincipal p) {
        storageService.permanentDeleteFolder(scope(orgId), p.getUserId(), folderId);
        return ResponseEntity.ok(Map.of("message", "폴더가 영구 삭제되었습니다"));
    }

    @DeleteMapping("/trash")
    public ResponseEntity<Map<String, Object>> emptyTrash(
            @PathVariable String orgId, @AuthenticationPrincipal UserPrincipal p) {
        return ResponseEntity.ok(Map.of("deleted_count", storageService.emptyTrash(scope(orgId), p.getUserId())));
    }
}
