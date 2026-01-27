package com.kanban.domain.admin.dto;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.board.Role;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionStatus;
import com.kanban.domain.user.SystemRole;
import com.kanban.domain.user.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class AdminResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class UserList {
        private List<UserSummary> users;
        private long total;
        private int page;
        private int size;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class UserSummary {
        private String id;
        private String email;
        private String name;
        private String profileImage;
        private Boolean emailVerified;
        private String authProvider;
        private SystemRole systemRole;
        private int boardCount;
        private LocalDateTime lastLoginAt;
        private LocalDateTime createdAt;

        public static UserSummary of(User user, int boardCount) {
            return UserSummary.builder()
                    .id(user.getId())
                    .email(user.getEmail())
                    .name(user.getName())
                    .profileImage(user.getProfileImage())
                    .emailVerified(user.getEmailVerified())
                    .authProvider(user.getAuthProvider())
                    .systemRole(user.getSystemRole() != null ? user.getSystemRole() : SystemRole.USER)
                    .boardCount(boardCount)
                    .lastLoginAt(user.getLastLoginAt())
                    .createdAt(user.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class UserDetail {
        private String id;
        private String email;
        private String name;
        private String profileImage;
        private Boolean emailVerified;
        private String authProvider;
        private SystemRole systemRole;
        private int boardCount;
        private LocalDateTime lastLoginAt;
        private LocalDateTime createdAt;
        private List<BoardSummary> boards;

        public static UserDetail of(User user, int boardCount, List<BoardSummary> boards) {
            return UserDetail.builder()
                    .id(user.getId())
                    .email(user.getEmail())
                    .name(user.getName())
                    .profileImage(user.getProfileImage())
                    .emailVerified(user.getEmailVerified())
                    .authProvider(user.getAuthProvider())
                    .systemRole(user.getSystemRole() != null ? user.getSystemRole() : SystemRole.USER)
                    .boardCount(boardCount)
                    .lastLoginAt(user.getLastLoginAt())
                    .createdAt(user.getCreatedAt())
                    .boards(boards)
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardList {
        private List<BoardSummary> boards;
        private long total;
        private int page;
        private int size;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardSummary {
        private String id;
        private String name;
        private String description;
        private OwnerInfo owner;
        private BoardTier tier;
        private int memberCount;
        private int taskCount;
        private SubscriptionStatus subscriptionStatus;
        private LocalDateTime trialEndsAt;
        private LocalDateTime createdAt;

        public static BoardSummary of(Board board, int memberCount, int taskCount, Subscription subscription) {
            return BoardSummary.builder()
                    .id(board.getId())
                    .name(board.getName())
                    .description(board.getDescription())
                    .owner(OwnerInfo.of(board.getOwner()))
                    .tier(board.getTier())
                    .memberCount(memberCount)
                    .taskCount(taskCount)
                    .subscriptionStatus(subscription != null ? subscription.getStatus() : null)
                    .trialEndsAt(board.getTrialEndsAt())
                    .createdAt(board.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class BoardDetail {
        private String id;
        private String name;
        private String description;
        private OwnerInfo owner;
        private BoardTier tier;
        private int memberCount;
        private int taskCount;
        private SubscriptionStatus subscriptionStatus;
        private LocalDateTime trialEndsAt;
        private LocalDateTime createdAt;
        private List<MemberInfo> members;

        public static BoardDetail of(Board board, int memberCount, int taskCount,
                                     Subscription subscription, List<MemberInfo> members) {
            return BoardDetail.builder()
                    .id(board.getId())
                    .name(board.getName())
                    .description(board.getDescription())
                    .owner(OwnerInfo.of(board.getOwner()))
                    .tier(board.getTier())
                    .memberCount(memberCount)
                    .taskCount(taskCount)
                    .subscriptionStatus(subscription != null ? subscription.getStatus() : null)
                    .trialEndsAt(board.getTrialEndsAt())
                    .createdAt(board.getCreatedAt())
                    .members(members)
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

        public static OwnerInfo of(User user) {
            return OwnerInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .email(user.getEmail())
                    .profileImage(user.getProfileImage())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MemberInfo {
        private String id;
        private String name;
        private String email;
        private String profileImage;
        private Role role;
        private LocalDateTime joinedAt;

        public static MemberInfo of(BoardMember boardMember) {
            User user = boardMember.getUser();
            return MemberInfo.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .email(user.getEmail())
                    .profileImage(user.getProfileImage())
                    .role(boardMember.getRole())
                    .joinedAt(boardMember.getJoinedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Statistics {
        private long totalUsers;
        private long activeUsers;
        private long totalBoards;
        private long trialBoards;
        private long standardBoards;
        private long premiumBoards;
        private long activeSubscriptions;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SubscriptionList {
        private List<SubscriptionSummary> subscriptions;
        private long total;
        private int page;
        private int size;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SubscriptionSummary {
        private String id;
        private String boardId;
        private String boardName;
        private OwnerInfo owner;
        private SubscriptionStatus status;
        private String plan;
        private Integer price;
        private Integer seatCount;
        private LocalDateTime trialEndsAt;
        private LocalDateTime currentPeriodEnd;
        private LocalDateTime createdAt;

        public static SubscriptionSummary of(Subscription subscription, Board board) {
            return SubscriptionSummary.builder()
                    .id(subscription.getId())
                    .boardId(board.getId())
                    .boardName(board.getName())
                    .owner(OwnerInfo.of(board.getOwner()))
                    .status(subscription.getStatus())
                    .plan(subscription.getPlan())
                    .price(subscription.getPrice())
                    .seatCount(subscription.getSeatCount())
                    .trialEndsAt(subscription.getTrialEndsAt())
                    .currentPeriodEnd(subscription.getCurrentPeriodEnd())
                    .createdAt(subscription.getCreatedAt())
                    .build();
        }
    }
}
