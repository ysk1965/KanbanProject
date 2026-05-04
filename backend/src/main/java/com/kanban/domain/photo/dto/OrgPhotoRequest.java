package com.kanban.domain.photo.dto;

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
}
