package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrgAnnouncementComment;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class OrgAnnouncementCommentResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String announcementId;
        private String authorName;
        private String authorProfileImage;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private String content;

        public static Detail of(OrgAnnouncementComment c) {
            return Detail.builder()
                    .id(c.getId())
                    .announcementId(c.getAnnouncement().getId())
                    .authorName(c.getAuthor().getUser().getName())
                    .authorProfileImage(c.getAuthor().getUser().getProfileImage())
                    .createdAt(c.getCreatedAt())
                    .updatedAt(c.getUpdatedAt())
                    .content(c.getContent())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> comments;
        private int totalCount;

        public static ListResponse of(List<OrgAnnouncementComment> comments) {
            return ListResponse.builder()
                    .comments(comments.stream().map(Detail::of).toList())
                    .totalCount(comments.size())
                    .build();
        }
    }
}
