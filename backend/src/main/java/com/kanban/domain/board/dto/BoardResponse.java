package com.kanban.domain.board.dto;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.board.Role;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.time.LocalTime;

public class BoardResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Simple {
        private String id;
        private String name;
        private String description;
        private Role role;
        private boolean isStarred;
        private int memberCount;
        private SubscriptionInfo subscription;
        private LocalDateTime createdAt;

        public static Simple of(Board board, Role role, boolean isStarred, int memberCount, Subscription subscription) {
            return Simple.builder()
                    .id(board.getId())
                    .name(board.getName())
                    .description(board.getDescription())
                    .role(role)
                    .isStarred(isStarred)
                    .memberCount(memberCount)
                    .subscription(subscription != null ? SubscriptionInfo.of(subscription) : null)
                    .createdAt(board.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String name;
        private String description;
        private OwnerInfo owner;
        private Role myRole;
        private boolean isStarred;
        private int memberCount;
        private SubscriptionInfo subscription;
        private ScheduleSettings scheduleSettings;
        private String selectedMilestoneId;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(Board board, Role myRole, boolean isStarred, int memberCount, Subscription subscription) {
            return Detail.builder()
                    .id(board.getId())
                    .name(board.getName())
                    .description(board.getDescription())
                    .owner(OwnerInfo.of(board))
                    .myRole(myRole)
                    .isStarred(isStarred)
                    .memberCount(memberCount)
                    .subscription(subscription != null ? SubscriptionInfo.of(subscription) : null)
                    .scheduleSettings(ScheduleSettings.of(board))
                    .selectedMilestoneId(board.getSelectedMilestoneId())
                    .createdAt(board.getCreatedAt())
                    .updatedAt(board.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class OwnerInfo {
        private String id;
        private String name;
        private String email;
        private String profileImage;

        public static OwnerInfo of(Board board) {
            return OwnerInfo.builder()
                    .id(board.getOwner().getId())
                    .name(board.getOwner().getName())
                    .email(board.getOwner().getEmail())
                    .profileImage(board.getOwner().getProfileImage())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SubscriptionInfo {
        private SubscriptionStatus status;
        private String plan;
        private LocalDateTime trialEndsAt;
        private LocalDateTime currentPeriodEnd;

        public static SubscriptionInfo of(Subscription subscription) {
            return SubscriptionInfo.builder()
                    .status(subscription.getStatus())
                    .plan(subscription.getPlan())
                    .trialEndsAt(subscription.getTrialEndsAt())
                    .currentPeriodEnd(subscription.getCurrentPeriodEnd())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class StarToggle {
        private String boardId;
        private boolean isStarred;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ScheduleSettings {
        private Integer workHoursPerDay;
        private LocalTime workStartTime;

        public static ScheduleSettings of(Board board) {
            return ScheduleSettings.builder()
                    .workHoursPerDay(board.getWorkHoursPerDay())
                    .workStartTime(board.getWorkStartTime())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TierInfo {
        private BoardTier tier;
        private LocalDateTime trialEndsAt;
        private boolean canAccessSchedule;
        private boolean canAccessMilestone;

        public static TierInfo of(Board board) {
            return TierInfo.builder()
                    .tier(board.getTier())
                    .trialEndsAt(board.getTrialEndsAt())
                    .canAccessSchedule(board.canAccessSchedule())
                    .canAccessMilestone(board.canAccessMilestone())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Limits {
        private Integer taskLimit;
        private int currentTaskCount;
        private boolean canCreateTask;

        public static Limits of(Board board, int currentTaskCount) {
            Integer limit = board.getTaskLimit();
            boolean canCreate = limit == null || currentTaskCount < limit;
            return Limits.builder()
                    .taskLimit(limit)
                    .currentTaskCount(currentTaskCount)
                    .canCreateTask(canCreate)
                    .build();
        }
    }
}
