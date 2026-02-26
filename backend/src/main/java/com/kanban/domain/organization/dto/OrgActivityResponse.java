package com.kanban.domain.organization.dto;

import com.kanban.domain.organization.OrgActivity;
import com.kanban.domain.organization.OrgActivityType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public class OrgActivityResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String actorName;
        private OrgActivityType activityType;
        private String targetName;
        private Map<String, Object> metadata;
        private LocalDateTime createdAt;

        public static Detail of(OrgActivity a) {
            return Detail.builder()
                    .id(a.getId())
                    .actorName(a.getActorName())
                    .activityType(a.getActivityType())
                    .targetName(a.getTargetName())
                    .metadata(a.getMetadata())
                    .createdAt(a.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> activities;
        private boolean hasMore;
        private LocalDateTime nextCursor;

        public static ListResponse of(List<OrgActivity> items, int limit) {
            boolean hasMore = items.size() > limit;
            List<OrgActivity> trimmed = hasMore ? items.subList(0, limit) : items;

            LocalDateTime nextCursor = hasMore && !trimmed.isEmpty()
                    ? trimmed.get(trimmed.size() - 1).getCreatedAt()
                    : null;

            return ListResponse.builder()
                    .activities(trimmed.stream().map(Detail::of).toList())
                    .hasMore(hasMore)
                    .nextCursor(nextCursor)
                    .build();
        }
    }
}
