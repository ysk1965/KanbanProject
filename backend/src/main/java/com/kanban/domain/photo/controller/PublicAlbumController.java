package com.kanban.domain.photo.controller;

import com.kanban.domain.photo.dto.OrgPhotoResponse;
import com.kanban.domain.photo.service.OrgPhotoService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

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
}
