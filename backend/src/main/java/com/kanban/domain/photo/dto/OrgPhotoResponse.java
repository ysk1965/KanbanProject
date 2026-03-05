package com.kanban.domain.photo.dto;

import com.kanban.domain.photo.OrgPhoto;
import com.kanban.domain.photo.OrgPhotoTab;
import com.kanban.domain.user.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class OrgPhotoResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TabInfo {
        private String id;
        private String name;
        private String description;
        private int photoCount;
        private String coverPhotoUrl;
        private int sortOrder;
        private Boolean isShared;
        private String shareToken;
        private UserInfo createdBy;
        private LocalDateTime createdAt;

        public static TabInfo from(OrgPhotoTab tab) {
            return TabInfo.builder()
                    .id(tab.getId())
                    .name(tab.getName())
                    .description(tab.getDescription())
                    .photoCount(tab.getPhotoCount())
                    .coverPhotoUrl(tab.getCoverPhoto() != null ? tab.getCoverPhoto().getThumbnailUrl() : null)
                    .sortOrder(tab.getSortOrder())
                    .isShared(tab.getIsShared())
                    .shareToken(tab.getShareToken())
                    .createdBy(UserInfo.from(tab.getCreatedBy()))
                    .createdAt(tab.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PhotoDetail {
        private String id;
        private String tabId;
        private String s3Key;
        private String thumbnailKey;
        private String url;
        private String thumbnailUrl;
        private String originalFilename;
        private long fileSize;
        private String contentType;
        private Integer width;
        private Integer height;
        private String caption;
        private UserInfo uploadedBy;
        private LocalDateTime createdAt;

        public static PhotoDetail from(OrgPhoto photo) {
            return PhotoDetail.builder()
                    .id(photo.getId())
                    .tabId(photo.getTab().getId())
                    .s3Key(photo.getS3Key())
                    .thumbnailKey(photo.getThumbnailKey())
                    .url(photo.getUrl())
                    .thumbnailUrl(photo.getThumbnailUrl())
                    .originalFilename(photo.getOriginalFilename())
                    .fileSize(photo.getFileSize())
                    .contentType(photo.getContentType())
                    .width(photo.getWidth())
                    .height(photo.getHeight())
                    .caption(photo.getCaption())
                    .uploadedBy(UserInfo.from(photo.getUploadedBy()))
                    .createdAt(photo.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PhotoPage {
        private List<PhotoDetail> photos;
        private String nextCursor;
        private boolean hasNext;
        private long totalCount;
    }

    // ==================== Shared Gallery DTOs ====================

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SharedGalleryInfo {
        private String organizationName;
        private String organizationLogoUrl;
        private List<SharedAlbumSummary> albums;
        private int totalPhotoCount;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SharedAlbumSummary {
        private String id;
        private String name;
        private String description;
        private int photoCount;
        private String coverPhotoUrl;
    }

    /** kept for backward compat — single-album share endpoint */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class SharedAlbumInfo {
        private String albumName;
        private String albumDescription;
        private int photoCount;
        private String coverPhotoUrl;
        private String organizationName;
        private String organizationLogoUrl;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SharedPhotoItem {
        private String id;
        private String url;
        private String thumbnailUrl;
        private String originalFilename;
        private long fileSize;
        private String contentType;
        private Integer width;
        private Integer height;
        private String caption;
        private LocalDateTime createdAt;

        public static SharedPhotoItem from(OrgPhoto photo) {
            return SharedPhotoItem.builder()
                    .id(photo.getId())
                    .url(photo.getUrl())
                    .thumbnailUrl(photo.getThumbnailUrl())
                    .originalFilename(photo.getOriginalFilename())
                    .fileSize(photo.getFileSize())
                    .contentType(photo.getContentType())
                    .width(photo.getWidth())
                    .height(photo.getHeight())
                    .caption(photo.getCaption())
                    .createdAt(photo.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SharedPhotoPage {
        private List<SharedPhotoItem> photos;
        private String nextCursor;
        private boolean hasNext;
        private long totalCount;
    }

    // ==================== Common DTOs ====================

    @Getter
    @Builder
    @AllArgsConstructor
    public static class UserInfo {
        private String id;
        private String name;
        private String email;
        private String profileImageUrl;

        public static UserInfo from(User user) {
            return UserInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .email(user.getEmail())
                    .profileImageUrl(user.getProfileImage())
                    .build();
        }
    }
}
