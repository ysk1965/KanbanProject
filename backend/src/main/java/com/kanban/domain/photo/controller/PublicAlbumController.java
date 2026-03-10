package com.kanban.domain.photo.controller;

import com.kanban.domain.photo.dto.OrgPhotoRequest;
import com.kanban.domain.photo.dto.OrgPhotoResponse;
import com.kanban.domain.photo.service.OrgPhotoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/public")
@RequiredArgsConstructor
public class PublicAlbumController {

    private final OrgPhotoService orgPhotoService;

    // ==================== Gallery-Level (Organization) ====================

    @GetMapping("/gallery/{shareToken}")
    public ResponseEntity<OrgPhotoResponse.SharedGalleryInfo> getSharedGallery(
            @PathVariable String shareToken) {
        return ResponseEntity.ok(orgPhotoService.getSharedGallery(shareToken));
    }

    @GetMapping("/gallery/{shareToken}/albums/{albumId}/photos")
    public ResponseEntity<OrgPhotoResponse.SharedPhotoPage> getSharedGalleryPhotos(
            @PathVariable String shareToken,
            @PathVariable String albumId,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "30") int size) {
        return ResponseEntity.ok(orgPhotoService.getSharedGalleryPhotos(shareToken, albumId, cursor, size));
    }

    // ==================== Per-Album (Legacy) ====================

    @GetMapping("/albums/{shareToken}")
    public ResponseEntity<OrgPhotoResponse.SharedAlbumInfo> getSharedAlbum(
            @PathVariable String shareToken) {
        return ResponseEntity.ok(orgPhotoService.getSharedAlbum(shareToken));
    }

    @GetMapping("/albums/{shareToken}/photos")
    public ResponseEntity<OrgPhotoResponse.SharedPhotoPage> getSharedAlbumPhotos(
            @PathVariable String shareToken,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "30") int size) {
        return ResponseEntity.ok(orgPhotoService.getSharedAlbumPhotos(shareToken, cursor, size));
    }

    // ==================== Public Upload ====================

    @GetMapping("/upload/{uploadToken}")
    public ResponseEntity<OrgPhotoResponse.UploadAlbumInfo> getUploadAlbumInfo(
            @PathVariable String uploadToken) {
        return ResponseEntity.ok(orgPhotoService.getUploadAlbumInfo(uploadToken));
    }

    @PostMapping("/upload/{uploadToken}")
    public ResponseEntity<List<OrgPhotoResponse.PhotoDetail>> publicUpload(
            @PathVariable String uploadToken,
            @RequestParam("files") List<MultipartFile> files) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(orgPhotoService.publicUploadPhotos(uploadToken, files));
    }

    // ==================== Gallery-Level Upload ====================

    @GetMapping("/gallery-upload/{uploadToken}")
    public ResponseEntity<OrgPhotoResponse.GalleryUploadInfo> getGalleryUploadInfo(
            @PathVariable String uploadToken) {
        return ResponseEntity.ok(orgPhotoService.getGalleryUploadInfo(uploadToken));
    }

    @PostMapping("/gallery-upload/{uploadToken}/albums")
    public ResponseEntity<OrgPhotoResponse.SharedAlbumSummary> publicGalleryCreateTab(
            @PathVariable String uploadToken,
            @Valid @RequestBody OrgPhotoRequest.TabCreate request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(orgPhotoService.publicGalleryCreateTab(uploadToken, request));
    }

    @DeleteMapping("/gallery-upload/{uploadToken}/albums/{albumId}")
    public ResponseEntity<Map<String, String>> publicGalleryDeleteTab(
            @PathVariable String uploadToken,
            @PathVariable String albumId) {
        orgPhotoService.publicGalleryDeleteTab(uploadToken, albumId);
        return ResponseEntity.ok(Map.of("message", "Album deleted"));
    }

    @GetMapping("/gallery-upload/{uploadToken}/albums/{albumId}/photos")
    public ResponseEntity<OrgPhotoResponse.SharedPhotoPage> getGalleryUploadPhotos(
            @PathVariable String uploadToken,
            @PathVariable String albumId,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "30") int size) {
        return ResponseEntity.ok(orgPhotoService.getGalleryUploadPhotos(uploadToken, albumId, cursor, size));
    }

    @PostMapping("/gallery-upload/{uploadToken}/albums/{albumId}/photos")
    public ResponseEntity<List<OrgPhotoResponse.PhotoDetail>> publicGalleryUploadPhotos(
            @PathVariable String uploadToken,
            @PathVariable String albumId,
            @RequestParam("files") List<MultipartFile> files) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(orgPhotoService.publicGalleryUploadPhotos(uploadToken, albumId, files));
    }

    @DeleteMapping("/gallery-upload/{uploadToken}/albums/{albumId}/photos/{photoId}")
    public ResponseEntity<Map<String, String>> publicGalleryDeletePhoto(
            @PathVariable String uploadToken,
            @PathVariable String albumId,
            @PathVariable String photoId) {
        orgPhotoService.publicGalleryDeletePhoto(uploadToken, albumId, photoId);
        return ResponseEntity.ok(Map.of("message", "Photo deleted"));
    }
}
