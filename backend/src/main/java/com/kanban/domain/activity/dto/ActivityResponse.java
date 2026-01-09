package com.kanban.domain.activity.dto;

import com.kanban.domain.activity.ActivityAction;
import com.kanban.domain.activity.ActivityLog;
import com.kanban.domain.activity.TargetType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public class ActivityResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private UserInfo user;
        private ActivityAction action;
        private TargetType targetType;
        private String targetId;
        private Map<String, Object> metadata;
        private LocalDateTime createdAt;

        public static Detail of(ActivityLog log) {
            return Detail.builder()
                    .id(log.getId())
                    .user(UserInfo.of(log))
                    .action(log.getAction())
                    .targetType(log.getTargetType())
                    .targetId(log.getTargetId())
                    .metadata(log.getMetadata())
                    .createdAt(log.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class UserInfo {
        private String id;
        private String name;
        private String profileImage;

        public static UserInfo of(ActivityLog log) {
            return UserInfo.builder()
                    .id(log.getUser().getId())
                    .name(log.getUser().getName())
                    .profileImage(log.getUser().getProfileImage())
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

        public static ListResponse of(List<ActivityLog> logs, int limit) {
            boolean hasMore = logs.size() > limit;
            List<ActivityLog> trimmedLogs = hasMore ? logs.subList(0, limit) : logs;

            LocalDateTime nextCursor = hasMore && !trimmedLogs.isEmpty()
                    ? trimmedLogs.get(trimmedLogs.size() - 1).getCreatedAt()
                    : null;

            return ListResponse.builder()
                    .activities(trimmedLogs.stream().map(Detail::of).toList())
                    .hasMore(hasMore)
                    .nextCursor(nextCursor)
                    .build();
        }
    }
}
