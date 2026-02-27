package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrgCelebrationMessage;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class CelebrationMessageResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String authorName;
        private String authorProfileImageUrl;
        private String message;
        private LocalDateTime createdAt;

        public static Detail of(OrgCelebrationMessage msg) {
            return Detail.builder()
                    .id(msg.getId())
                    .authorName(msg.getAuthor().getName())
                    .authorProfileImageUrl(msg.getAuthor().getProfileImage())
                    .message(msg.getMessage())
                    .createdAt(msg.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> messages;
        private boolean hasMore;
        private String nextCursor;

        public static ListResponse of(List<OrgCelebrationMessage> items, int limit) {
            boolean hasMore = items.size() > limit;
            List<OrgCelebrationMessage> trimmed = hasMore ? items.subList(0, limit) : items;

            String nextCursor = hasMore && !trimmed.isEmpty()
                    ? trimmed.get(trimmed.size() - 1).getCreatedAt().toString()
                    : null;

            return ListResponse.builder()
                    .messages(trimmed.stream().map(Detail::of).toList())
                    .hasMore(hasMore)
                    .nextCursor(nextCursor)
                    .build();
        }
    }
}
