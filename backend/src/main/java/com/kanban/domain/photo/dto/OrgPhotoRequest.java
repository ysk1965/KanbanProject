package com.kanban.domain.photo.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

public class OrgPhotoRequest {

    @Getter
    @NoArgsConstructor
    public static class TabCreate {
        @NotBlank(message = "탭 이름은 필수입니다")
        @Size(max = 50, message = "탭 이름은 50자 이내여야 합니다")
        private String name;

        @Size(max = 200, message = "설명은 200자 이내여야 합니다")
        private String description;
    }

    @Getter
    @NoArgsConstructor
    public static class TabUpdate {
        @NotBlank(message = "탭 이름은 필수입니다")
        @Size(max = 50, message = "탭 이름은 50자 이내여야 합니다")
        private String name;

        @Size(max = 200, message = "설명은 200자 이내여야 합니다")
        private String description;

        private String coverPhotoId;
    }

    @Getter
    @NoArgsConstructor
    public static class TabReorder {
        @NotEmpty(message = "탭 ID 목록은 필수입니다")
        private List<String> tabIds;
    }

    @Getter
    @NoArgsConstructor
    public static class PhotoUpdate {
        @Size(max = 300, message = "캡션은 300자 이내여야 합니다")
        private String caption;
    }

    @Getter
    @NoArgsConstructor
    public static class BatchDelete {
        @NotEmpty(message = "삭제할 사진 ID 목록은 필수입니다")
        private List<String> photoIds;
    }

    @Getter
    @NoArgsConstructor
    public static class BatchDownload {
        @NotEmpty(message = "다운로드할 사진 ID 목록은 필수입니다")
        @Size(max = 100, message = "일괄 다운로드는 최대 100장까지 가능합니다")
        private List<String> photoIds;
    }

    @Getter
    @NoArgsConstructor
    public static class ShareLinkCreate {
        private String tabId;

        @NotBlank(message = "링크 종류는 필수입니다")
        private String linkType;

        private Integer expiresInDays;

        @Size(max = 100, message = "라벨은 100자 이내여야 합니다")
        private String title;
    }

    // ==================== Direct (presigned) Upload ====================

    @Getter
    @NoArgsConstructor
    public static class UploadPresign {
        /** 관리자 업로드에서만 사용. 공개 업로드 링크는 토큰/경로로 앨범이 정해진다. */
        private String tabId;

        @NotEmpty(message = "파일 목록은 필수입니다")
        @Size(max = 100, message = "한 번에 최대 100개까지 요청할 수 있습니다")
        @Valid
        private List<PresignFile> files;
    }

    @Getter
    @NoArgsConstructor
    public static class PresignFile {
        @NotBlank
        @Size(max = 64)
        private String clientId;

        @NotBlank
        @Size(max = 255)
        private String filename;

        @NotBlank
        private String contentType;

        private long size;
    }

    @Getter
    @NoArgsConstructor
    public static class UploadConfirm {
        private String tabId;

        @NotEmpty(message = "등록할 항목은 필수입니다")
        @Size(max = 50, message = "한 번에 최대 50개까지 등록할 수 있습니다")
        @Valid
        private List<ConfirmItem> items;
    }

    @Getter
    @NoArgsConstructor
    public static class ConfirmItem {
        @NotBlank
        @Size(max = 500)
        private String s3Key;

        private Integer width;
        private Integer height;
        private Boolean hasThumbnail;
    }
}
