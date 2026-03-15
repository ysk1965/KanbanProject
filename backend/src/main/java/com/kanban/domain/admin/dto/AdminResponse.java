package com.kanban.domain.admin.dto;

import com.kanban.domain.announcement.Announcement;
import com.kanban.domain.announcement.AnnouncementType;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.board.BoardRole;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.OrganizationMember;
import com.kanban.domain.organization.OrgRole;
import com.kanban.domain.subscription.BillingCycle;
import com.kanban.domain.subscription.OrgPlan;
import com.kanban.domain.subscription.OrgSubscription;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionStatus;
import com.kanban.domain.user.SystemRole;
import com.kanban.domain.user.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

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
        private Boolean isActive;
        private LocalDateTime deactivatedAt;
        private String deactivatedReason;

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
                    .isActive(user.getIsActive())
                    .deactivatedAt(user.getDeactivatedAt())
                    .deactivatedReason(user.getDeactivatedReason())
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
        private String authProviderId;
        private SystemRole systemRole;
        private int boardCount;
        private LocalDateTime lastLoginAt;
        private LocalDateTime createdAt;
        private LocalDateTime emailVerifiedAt;
        private Boolean isActive;
        private LocalDateTime deactivatedAt;
        private String deactivatedReason;
        private List<BoardSummary> boards;
        // Personal AI Credit fields
        private Integer personalAiCredits;
        private Integer personalCreditsUsed;
        private LocalDateTime personalCreditsResetDate;

        public static UserDetail of(User user, int boardCount, List<BoardSummary> boards) {
            return UserDetail.builder()
                    .id(user.getId())
                    .email(user.getEmail())
                    .name(user.getName())
                    .profileImage(user.getProfileImage())
                    .emailVerified(user.getEmailVerified())
                    .authProvider(user.getAuthProvider())
                    .authProviderId(user.getAuthProviderId())
                    .systemRole(user.getSystemRole() != null ? user.getSystemRole() : SystemRole.USER)
                    .boardCount(boardCount)
                    .lastLoginAt(user.getLastLoginAt())
                    .createdAt(user.getCreatedAt())
                    .emailVerifiedAt(user.getEmailVerifiedAt())
                    .isActive(user.getIsActive())
                    .deactivatedAt(user.getDeactivatedAt())
                    .deactivatedReason(user.getDeactivatedReason())
                    .boards(boards)
                    .personalAiCredits(user.getPersonalAiCredits())
                    .personalCreditsUsed(user.getPersonalCreditsUsed())
                    .personalCreditsResetDate(user.getPersonalCreditsResetDate())
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
        private String boardType;
        private int memberCount;
        private int taskCount;
        private SubscriptionStatus subscriptionStatus;
        private LocalDateTime trialEndsAt;
        private LocalDateTime createdAt;
        private LocalDateTime deletedAt;

        public static BoardSummary of(Board board, int memberCount, int taskCount, Subscription subscription) {
            return BoardSummary.builder()
                    .id(board.getId())
                    .name(board.getName())
                    .description(board.getDescription())
                    .owner(OwnerInfo.of(board.getOwner()))
                    .tier(board.getTier())
                    .boardType(board.getBoardType() != null ? board.getBoardType().name() : "TEAM")
                    .memberCount(memberCount)
                    .taskCount(taskCount)
                    .subscriptionStatus(subscription != null ? subscription.getStatus() : null)
                    .trialEndsAt(board.getTrialEndsAt())
                    .createdAt(board.getCreatedAt())
                    .deletedAt(board.getDeletedAt())
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
        private String boardType;
        private int memberCount;
        private int taskCount;
        private SubscriptionStatus subscriptionStatus;
        private Integer seatCount;
        private LocalDateTime trialEndsAt;
        private LocalDateTime createdAt;
        private LocalDateTime deletedAt;
        private List<MemberInfo> members;
        // AI Credit fields
        private Integer monthlyAiCredits;
        private Integer monthlyCreditsUsed;
        private Integer purchasedCredits;
        private LocalDateTime creditsResetDate;

        public static BoardDetail of(Board board, int memberCount, int taskCount,
                                     Subscription subscription, List<MemberInfo> members) {
            return BoardDetail.builder()
                    .id(board.getId())
                    .name(board.getName())
                    .description(board.getDescription())
                    .owner(OwnerInfo.of(board.getOwner()))
                    .tier(board.getTier())
                    .boardType(board.getBoardType() != null ? board.getBoardType().name() : "TEAM")
                    .memberCount(memberCount)
                    .taskCount(taskCount)
                    .subscriptionStatus(subscription != null ? subscription.getStatus() : null)
                    .seatCount(subscription != null ? subscription.getSeatCount() : null)
                    .trialEndsAt(board.getTrialEndsAt())
                    .createdAt(board.getCreatedAt())
                    .deletedAt(board.getDeletedAt())
                    .members(members)
                    .monthlyAiCredits(subscription != null ? subscription.getMonthlyAiCredits() : null)
                    .monthlyCreditsUsed(subscription != null ? subscription.getMonthlyCreditsUsed() : null)
                    .purchasedCredits(subscription != null ? subscription.getPurchasedCredits() : null)
                    .creditsResetDate(subscription != null ? subscription.getCreditsResetDate() : null)
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
        private BoardRole role;
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

    // ==================== Analytics DTOs ====================

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SignupTrend {
        private List<SignupTrendData> data;
        private long total;

        @Getter
        @Builder
        @AllArgsConstructor
        public static class SignupTrendData {
            private String date;
            private long count;
            private long emailCount;
            private long googleCount;
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ActiveUserStats {
        private long dau;
        private long wau;
        private long mau;
        private List<DailyActiveData> trend;

        @Getter
        @Builder
        @AllArgsConstructor
        public static class DailyActiveData {
            private String date;
            private long count;
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ConversionStats {
        private long totalTrialStarted;
        private long totalConverted;
        private double conversionRate;
        private long trialInProgress;
        private long trialExpiredNotConverted;
        private List<MonthlyConversion> trend;

        @Getter
        @Builder
        @AllArgsConstructor
        public static class MonthlyConversion {
            private String month;
            private long trialStarted;
            private long converted;
            private double rate;
        }
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

    // ==================== Diary Stats ====================

    @Getter
    @Builder
    @AllArgsConstructor
    public static class DiaryStats {
        private long totalEntries;
        private double completionRate;
        private long activeUsers;
        private List<DailyCount> trend;

        @Getter
        @Builder
        @AllArgsConstructor
        public static class DailyCount {
            private String date;
            private long count;
        }
    }

    // ==================== Personal Conversion Stats ====================

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PersonalConversionStats {
        private long personalOnly;
        private long both;
        private double conversionRate;
        private List<DailyCount> trend;

        @Getter
        @Builder
        @AllArgsConstructor
        public static class DailyCount {
            private String date;
            private long count;
        }
    }

    // ==================== Announcement ====================

    @Getter
    @Builder
    @AllArgsConstructor
    public static class AnnouncementDetail {
        private String id;
        private String title;
        private String content;
        private AnnouncementType type;
        private Boolean isActive;
        private LocalDateTime startAt;
        private LocalDateTime endAt;
        private Integer priority;
        private String targetRole;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static AnnouncementDetail of(Announcement announcement) {
            return AnnouncementDetail.builder()
                    .id(announcement.getId())
                    .title(announcement.getTitle())
                    .content(announcement.getContent())
                    .type(announcement.getType())
                    .isActive(announcement.getIsActive())
                    .startAt(announcement.getStartAt())
                    .endAt(announcement.getEndAt())
                    .priority(announcement.getPriority())
                    .targetRole(announcement.getTargetRole())
                    .createdAt(announcement.getCreatedAt())
                    .updatedAt(announcement.getUpdatedAt())
                    .build();
        }
    }

    // ==================== Organizations ====================

    @Getter
    @Builder
    @AllArgsConstructor
    public static class OrgList {
        private List<OrgSummary> organizations;
        private long total;
        private int page;
        private int size;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class OrgSummary {
        private String id;
        private String name;
        private String description;
        private String logoUrl;
        private OwnerInfo owner;
        private OrgPlan plan;
        private SubscriptionStatus subscriptionStatus;
        private int memberCount;
        private int boardCount;
        private int seatCount;
        private LocalDateTime trialEndsAt;
        private LocalDateTime createdAt;
        private LocalDateTime deletedAt;

        public static OrgSummary of(Organization org, int memberCount, int boardCount, OrgSubscription sub) {
            return OrgSummary.builder()
                    .id(org.getId())
                    .name(org.getName())
                    .description(org.getDescription())
                    .logoUrl(org.getLogoUrl())
                    .owner(org.getOwner() != null ? OwnerInfo.of(org.getOwner()) : null)
                    .plan(sub != null ? sub.getPlan() : OrgPlan.FREE)
                    .subscriptionStatus(sub != null ? sub.getStatus() : null)
                    .memberCount(memberCount)
                    .boardCount(boardCount)
                    .seatCount(sub != null ? sub.getSeatCount() : 0)
                    .trialEndsAt(sub != null ? sub.getTrialEndsAt() : null)
                    .createdAt(org.getCreatedAt())
                    .deletedAt(org.getDeletedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class OrgDetail {
        // 기본 정보
        private String id;
        private String name;
        private String description;
        private String logoUrl;
        private OwnerInfo owner;
        // 구독 정보
        private OrgPlan plan;
        private SubscriptionStatus subscriptionStatus;
        private BillingCycle billingCycle;
        private int seatCount;
        private int activeMemberCount;
        private Integer pricePerSeat;
        private Integer totalPrice;
        private LocalDateTime trialEndsAt;
        private LocalDateTime currentPeriodEnd;
        private Boolean trialUsed;
        // AI 크레딧
        private Integer monthlyAiCredits;
        private Integer monthlyCreditsUsed;
        private Integer remainingAiCredits;
        private LocalDateTime creditsResetDate;
        // 구조 토글
        private Boolean departmentsEnabled;
        private Boolean jobGroupsEnabled;
        private Boolean positionsEnabled;
        private Boolean titlesEnabled;
        private Boolean gradesEnabled;
        // 카운트
        private int memberCount;
        private int boardCount;
        // 중첩 데이터
        private List<OrgMemberInfo> members;
        private List<BoardSummary> boards;
        // 날짜
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private LocalDateTime deletedAt;

        public static OrgDetail of(Organization org, OrgSubscription sub,
                                   List<OrgMemberInfo> members, List<BoardSummary> boards,
                                   int memberCount, int boardCount) {
            return OrgDetail.builder()
                    .id(org.getId())
                    .name(org.getName())
                    .description(org.getDescription())
                    .logoUrl(org.getLogoUrl())
                    .owner(org.getOwner() != null ? OwnerInfo.of(org.getOwner()) : null)
                    .plan(sub != null ? sub.getPlan() : OrgPlan.FREE)
                    .subscriptionStatus(sub != null ? sub.getStatus() : null)
                    .billingCycle(sub != null ? sub.getBillingCycle() : null)
                    .seatCount(sub != null ? sub.getSeatCount() : 0)
                    .activeMemberCount(sub != null ? sub.getActiveMemberCount() : 0)
                    .pricePerSeat(sub != null ? sub.getPricePerSeat() : null)
                    .totalPrice(sub != null ? sub.getTotalPrice() : null)
                    .trialEndsAt(sub != null ? sub.getTrialEndsAt() : null)
                    .currentPeriodEnd(sub != null ? sub.getCurrentPeriodEnd() : null)
                    .trialUsed(org.getTrialUsed())
                    .monthlyAiCredits(sub != null ? sub.getMonthlyAiCredits() : null)
                    .monthlyCreditsUsed(sub != null ? sub.getMonthlyCreditsUsed() : null)
                    .remainingAiCredits(sub != null ? sub.getTotalAvailableCredits() : null)
                    .creditsResetDate(sub != null ? sub.getCreditsResetDate() : null)
                    .departmentsEnabled(org.getDepartmentsEnabled())
                    .jobGroupsEnabled(org.getJobGroupsEnabled())
                    .positionsEnabled(org.getPositionsEnabled())
                    .titlesEnabled(org.getTitlesEnabled())
                    .gradesEnabled(org.getGradesEnabled())
                    .memberCount(memberCount)
                    .boardCount(boardCount)
                    .members(members)
                    .boards(boards)
                    .createdAt(org.getCreatedAt())
                    .updatedAt(org.getUpdatedAt())
                    .deletedAt(org.getDeletedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class OrgMemberInfo {
        private String id;
        private String userId;
        private String name;
        private String email;
        private String profileImage;
        private OrgRole role;
        private String departmentName;
        private String positionName;
        private String titleName;
        private String contractType;
        private String workStatus;
        private LocalDateTime joinedAt;

        public static OrgMemberInfo of(OrganizationMember member) {
            User user = member.getUser();
            return OrgMemberInfo.builder()
                    .id(member.getId())
                    .userId(user.getId())
                    .name(user.getName())
                    .email(user.getEmail())
                    .profileImage(user.getProfileImage())
                    .role(member.getRole())
                    .departmentName(member.getDepartment() != null ? member.getDepartment().getName() : null)
                    .positionName(member.getPosition() != null ? member.getPosition().getName() : null)
                    .titleName(member.getTitle() != null ? member.getTitle().getName() : null)
                    .contractType(member.getContractType() != null ? member.getContractType().name() : null)
                    .workStatus(member.getWorkStatus() != null ? member.getWorkStatus().name() : null)
                    .joinedAt(member.getJoinedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class OrgStatistics {
        private long totalOrganizations;
        private long activeOrganizations;
        private long freeOrgs;
        private long teamOrgs;
        private long trialOrgs;
        private long activeOrgSubscriptions;
        private long totalOrgMembers;
    }

    // ==================== Churn Analysis ====================

    @Getter
    @Builder
    @AllArgsConstructor
    public static class RetentionAnalysis {
        private List<CohortData> cohorts;
        private List<Double> averageRetention;

        @Getter
        @Builder
        @AllArgsConstructor
        public static class CohortData {
            private String cohortWeek;
            private long signupCount;
            private List<Double> retention;
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class InactiveUserList {
        private List<InactiveUser> users;
        private long total;
        private int page;
        private int size;
        private InactiveSummary summary;

        @Getter
        @Builder
        @AllArgsConstructor
        public static class InactiveUser {
            private String id;
            private String name;
            private String email;
            private String profileImage;
            private LocalDateTime createdAt;
            private LocalDateTime lastActiveAt;
            private long inactiveDays;
            private int boardCount;
            private String lastAction;
            private LocalDateTime lastActionAt;
        }

        @Getter
        @Builder
        @AllArgsConstructor
        public static class InactiveSummary {
            private long inactive7d;
            private long inactive14d;
            private long inactive30d;
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TrialDropoutAnalysis {
        private long totalExpiredTrials;
        private List<DayDropout> dropoutByDay;
        private List<ActionStat> actionsBeforeDropout;
        private long neverActedCount;
        private double neverActedPercentage;

        @Getter
        @Builder
        @AllArgsConstructor
        public static class DayDropout {
            private int trialDay;
            private long count;
            private double percentage;
        }

        @Getter
        @Builder
        @AllArgsConstructor
        public static class ActionStat {
            private String action;
            private long count;
            private double percentage;
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ActivityTrends {
        private List<WeeklyActivity> weeklyActivity;
        private double activityChangeRate;
        private List<FeatureUsage> featureUsage;

        @Getter
        @Builder
        @AllArgsConstructor
        public static class WeeklyActivity {
            private String week;
            private long totalActions;
            private long activeUsers;
        }

        @Getter
        @Builder
        @AllArgsConstructor
        public static class FeatureUsage {
            private String action;
            private long count;
            private long uniqueUsers;
        }
    }

    // ==================== System ====================

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MaintenanceStatus {
        private boolean enabled;
        private String message;
        private LocalDateTime estimatedEndAt;
        private LocalDateTime startedAt;
    }
}
