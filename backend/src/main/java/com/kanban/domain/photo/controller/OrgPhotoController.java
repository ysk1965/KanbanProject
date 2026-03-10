package com.kanban.domain.photo.controller;

import com.kanban.domain.photo.dto.OrgPhotoRequest;
import com.kanban.domain.photo.dto.OrgPhotoResponse;
import com.kanban.domain.photo.service.OrgPhotoService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import com.kanban.domain.photo.OrgPhoto;

import java.io.InputStream;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}/photos")
@RequiredArgsConstructor
public class OrgPhotoController {

    private final OrgPhotoService orgPhotoService;

    // ==================== Tab Endpoints ====================

    @GetMapping("/tabs")
    public ResponseEntity<List<OrgPhotoResponse.TabInfo>> getTabs(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgPhotoService.getTabs(orgId, principal.getUserId()));
    }

    @PostMapping("/tabs")
    public ResponseEntity<OrgPhotoResponse.TabInfo> createTab(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgPhotoRequest.TabCreate request) {
        OrgPhotoResponse.TabInfo tab = orgPhotoService.createTab(orgId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(tab);
    }

    @PutMapping("/tabs/{tabId}")
    public ResponseEntity<OrgPhotoResponse.TabInfo> updateTab(
            @PathVariable String orgId,
            @PathVariable String tabId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgPhotoRequest.TabUpdate request) {
        return ResponseEntity.ok(orgPhotoService.updateTab(orgId, principal.getUserId(), tabId, request));
    }

    @DeleteMapping("/tabs/{tabId}")
    public ResponseEntity<Map<String, String>> deleteTab(
            @PathVariable String orgId,
            @PathVariable String tabId,
            @AuthenticationPrincipal UserPrincipal principal) {
        orgPhotoService.deleteTab(orgId, principal.getUserId(), tabId);
        return ResponseEntity.ok(Map.of("message", "탭이 삭제되었습니다"));
    }

    @PutMapping("/tabs/reorder")
    public ResponseEntity<Map<String, String>> reorderTabs(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgPhotoRequest.TabReorder request) {
        orgPhotoService.reorderTabs(orgId, principal.getUserId(), request);
        return ResponseEntity.ok(Map.of("message", "탭 순서가 변경되었습니다"));
    }

    // ==================== Sharing Endpoints ====================

    @PostMapping("/tabs/{tabId}/share")
    public ResponseEntity<OrgPhotoResponse.TabInfo> enableShare(
            @PathVariable String orgId,
            @PathVariable String tabId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgPhotoService.enableShare(orgId, principal.getUserId(), tabId));
    }

    @DeleteMapping("/tabs/{tabId}/share")
    public ResponseEntity<OrgPhotoResponse.TabInfo> disableShare(
            @PathVariable String orgId,
            @PathVariable String tabId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgPhotoService.disableShare(orgId, principal.getUserId(), tabId));
    }

    // ==================== Gallery-Level Sharing ====================

    @PostMapping("/gallery-share")
    public ResponseEntity<Map<String, String>> enableGalleryShare(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        String token = orgPhotoService.enableGalleryShare(orgId, principal.getUserId());
        return ResponseEntity.ok(Map.of("share_token", token));
    }

    @DeleteMapping("/gallery-share")
    public ResponseEntity<Void> disableGalleryShare(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        orgPhotoService.disableGalleryShare(orgId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/gallery-share")
    public ResponseEntity<Map<String, Object>> getGalleryShareStatus(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        String token = orgPhotoService.getGalleryShareToken(orgId);
        return ResponseEntity.ok(Map.of(
                "enabled", token != null,
                "share_token", token != null ? token : ""
        ));
    }

    // ==================== Gallery-Level Upload ====================

    @PostMapping("/gallery-upload")
    public ResponseEntity<Map<String, Object>> enableGalleryUpload(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        String token = orgPhotoService.enableGalleryUpload(orgId, principal.getUserId());
        return ResponseEntity.ok(Map.of("upload_token", token));
    }

    @DeleteMapping("/gallery-upload")
    public ResponseEntity<Void> disableGalleryUpload(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        orgPhotoService.disableGalleryUpload(orgId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/gallery-upload")
    public ResponseEntity<Map<String, Object>> getGalleryUploadStatus(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgPhotoService.getGalleryUploadStatus(orgId));
    }

    // ==================== Upload Link Endpoints ====================

    @PostMapping("/tabs/{tabId}/upload-link")
    public ResponseEntity<OrgPhotoResponse.TabInfo> enableUploadLink(
            @PathVariable String orgId,
            @PathVariable String tabId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgPhotoService.enableUploadLink(orgId, principal.getUserId(), tabId));
    }

    @DeleteMapping("/tabs/{tabId}/upload-link")
    public ResponseEntity<OrgPhotoResponse.TabInfo> disableUploadLink(
            @PathVariable String orgId,
            @PathVariable String tabId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(orgPhotoService.disableUploadLink(orgId, principal.getUserId(), tabId));
    }

    // ==================== Photo Endpoints ====================

    @GetMapping
    public ResponseEntity<OrgPhotoResponse.PhotoPage> getPhotos(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(value = "tab_id", required = false) String tabId,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "30") int size) {
        return ResponseEntity.ok(orgPhotoService.getPhotos(orgId, principal.getUserId(), tabId, cursor, size));
    }

    @PostMapping("/upload")
    public ResponseEntity<List<OrgPhotoResponse.PhotoDetail>> uploadPhotos(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam String tabId,
            @RequestParam("files") List<MultipartFile> files) {
        List<OrgPhotoResponse.PhotoDetail> photos = orgPhotoService.uploadPhotos(
                orgId, principal.getUserId(), tabId, files);
        return ResponseEntity.status(HttpStatus.CREATED).body(photos);
    }

    @PutMapping("/{photoId}")
    public ResponseEntity<OrgPhotoResponse.PhotoDetail> updatePhoto(
            @PathVariable String orgId,
            @PathVariable String photoId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgPhotoRequest.PhotoUpdate request) {
        return ResponseEntity.ok(orgPhotoService.updatePhoto(orgId, principal.getUserId(), photoId, request));
    }

    @DeleteMapping("/batch")
    public ResponseEntity<Map<String, String>> deletePhotos(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgPhotoRequest.BatchDelete request) {
        orgPhotoService.deletePhotos(orgId, principal.getUserId(), request);
        return ResponseEntity.ok(Map.of("message", "사진이 삭제되었습니다"));
    }

    @GetMapping("/{photoId}/download")
    public ResponseEntity<StreamingResponseBody> downloadPhoto(
            @PathVariable String orgId,
            @PathVariable String photoId,
            @AuthenticationPrincipal UserPrincipal principal) {
        InputStream inputStream = orgPhotoService.downloadPhoto(orgId, principal.getUserId(), photoId);

        StreamingResponseBody body = outputStream -> {
            try (inputStream) {
                inputStream.transferTo(outputStream);
            }
        };

        OrgPhoto photo = orgPhotoService.getPhoto(orgId, photoId);
        String filename = photo.getOriginalFilename() != null ? photo.getOriginalFilename() : "photo";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(body);
    }

    @PostMapping("/batch-download")
    public ResponseEntity<StreamingResponseBody> downloadPhotos(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgPhotoRequest.BatchDownload request) {
        StreamingResponseBody body = orgPhotoService.downloadPhotos(orgId, principal.getUserId(), request);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"photos.zip\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(body);
    }
}
