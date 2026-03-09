package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrgAnnouncement;
import com.kanban.domain.organization.OrgAnnouncementAttachment;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;
import java.util.function.UnaryOperator;

public class OrgAnnouncementResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String authorName;
        private String authorProfileImage;
        private String title;
        private String content;
        private Boolean isPinned;
        private int commentCount;
        private List<AttachmentInfo> attachments;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(OrgAnnouncement a) {
            return of(a, 0, null);
        }

        public static Detail of(OrgAnnouncement a, int commentCount) {
            return of(a, commentCount, null);
        }

        public static Detail of(OrgAnnouncement a, UnaryOperator<String> urlResolver) {
            return of(a, 0, urlResolver);
        }

        public static Detail of(OrgAnnouncement a, int commentCount, UnaryOperator<String> urlResolver) {
            List<AttachmentInfo> attachmentList = a.getAttachments() != null
                    ? a.getAttachments().stream().map(att -> AttachmentInfo.of(att, urlResolver)).toList()
                    : List.of();

            return Detail.builder()
                    .id(a.getId())
                    .authorName(a.getAuthor().getUser().getName())
                    .authorProfileImage(a.getAuthor().getUser().getProfileImage())
                    .title(a.getTitle())
                    .content(a.getContent())
                    .isPinned(a.getIsPinned())
                    .commentCount(commentCount)
                    .attachments(attachmentList)
                    .createdAt(a.getCreatedAt())
                    .updatedAt(a.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class AttachmentInfo {
        private String id;
        private String fileName;
        private String url;
        private String thumbnailUrl;
        private String contentType;
        private Long fileSize;
        private LocalDateTime createdAt;

        public static AttachmentInfo of(OrgAnnouncementAttachment attachment, UnaryOperator<String> urlResolver) {
            String url;
            String thumbUrl;
            if (urlResolver != null && attachment.getS3Key() != null) {
                url = urlResolver.apply(attachment.getS3Key());
                thumbUrl = attachment.getThumbnailS3Key() != null
                        ? urlResolver.apply(attachment.getThumbnailS3Key()) : null;
            } else {
                url = attachment.getUrl();
                thumbUrl = attachment.getThumbnailUrl();
            }
            return AttachmentInfo.builder()
                    .id(attachment.getId())
                    .fileName(attachment.getOriginalFileName())
                    .url(url)
                    .thumbnailUrl(thumbUrl)
                    .contentType(attachment.getContentType())
                    .fileSize(attachment.getFileSize())
                    .createdAt(attachment.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> announcements;
        private boolean hasMore;
        private LocalDateTime nextCursor;

        public static ListResponse of(List<OrgAnnouncement> items, int limit) {
            return of(items, limit, null);
        }

        public static ListResponse of(List<OrgAnnouncement> items, int limit, UnaryOperator<String> urlResolver) {
            boolean hasMore = items.size() > limit;
            List<OrgAnnouncement> trimmed = hasMore ? items.subList(0, limit) : items;

            LocalDateTime nextCursor = hasMore && !trimmed.isEmpty()
                    ? trimmed.get(trimmed.size() - 1).getCreatedAt()
                    : null;

            return ListResponse.builder()
                    .announcements(trimmed.stream().map(a -> Detail.of(a, urlResolver)).toList())
                    .hasMore(hasMore)
                    .nextCursor(nextCursor)
                    .build();
        }
    }
}
