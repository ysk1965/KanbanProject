package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrgAnnouncement;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class OrgAnnouncementResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String authorName;
        private String title;
        private String content;
        private Boolean isPinned;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(OrgAnnouncement a) {
            return Detail.builder()
                    .id(a.getId())
                    .authorName(a.getAuthor().getUser().getName())
                    .title(a.getTitle())
                    .content(a.getContent())
                    .isPinned(a.getIsPinned())
                    .createdAt(a.getCreatedAt())
                    .updatedAt(a.getUpdatedAt())
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
            boolean hasMore = items.size() > limit;
            List<OrgAnnouncement> trimmed = hasMore ? items.subList(0, limit) : items;

            LocalDateTime nextCursor = hasMore && !trimmed.isEmpty()
                    ? trimmed.get(trimmed.size() - 1).getCreatedAt()
                    : null;

            return ListResponse.builder()
                    .announcements(trimmed.stream().map(Detail::of).toList())
                    .hasMore(hasMore)
                    .nextCursor(nextCursor)
                    .build();
        }
    }
}
