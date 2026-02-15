package com.kanban.domain.board.dto;

import com.kanban.domain.activity.dto.ActivityResponse;
import com.kanban.domain.block.dto.BlockResponse;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.board.BoardRole;
import com.kanban.domain.feature.dto.FeatureResponse;
import com.kanban.domain.invite.dto.InviteResponse;
import com.kanban.domain.member.dto.MemberResponse;
import com.kanban.domain.milestone.dto.MilestoneResponse;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionStatus;
import com.kanban.domain.subscription.dto.AiCreditResponse;
import com.kanban.domain.subscription.dto.SubscriptionResponse;
import com.kanban.domain.tag.dto.TagResponse;
import com.kanban.domain.task.dto.TaskResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

public class BoardResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Simple {
        private String id;
        private String name;
        private String description;
        private BoardRole role;
        private boolean isStarred;
        private int memberCount;
        private int taskCount;
        private int completedTasks;
        private List<MemberPreview> members;
        private SubscriptionInfo subscription;
        private LocalDateTime createdAt;

        public static Simple of(Board board, BoardRole role, boolean isStarred, int memberCount,
                                int taskCount, int completedTasks, List<MemberPreview> members,
                                Subscription subscription) {
            return Simple.builder()
                    .id(board.getId())
                    .name(board.getName())
                    .description(board.getDescription())
                    .role(role)
                    .isStarred(isStarred)
                    .memberCount(memberCount)
                    .taskCount(taskCount)
                    .completedTasks(completedTasks)
                    .members(members)
                    .subscription(subscription != null ? SubscriptionInfo.of(subscription) : null)
                    .createdAt(board.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MemberPreview {
        private String id;
        private String name;
        private String profileImage;

        public static MemberPreview of(BoardMember boardMember) {
            return MemberPreview.builder()
                    .id(boardMember.getUser().getId())
                    .name(boardMember.getUser().getName())
                    .profileImage(boardMember.getUser().getProfileImage())
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
        private BoardRole myRole;
        private boolean isStarred;
        private int memberCount;
        private SubscriptionInfo subscription;
        private ScheduleSettings scheduleSettings;
        private String selectedMilestoneId;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static Detail of(Board board, BoardRole myRole, boolean isStarred, int memberCount, Subscription subscription) {
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
        private boolean canAccessSlack;

        public static TierInfo of(Board board) {
            return TierInfo.builder()
                    .tier(board.getTier())
                    .trialEndsAt(board.getTrialEndsAt())
                    .canAccessSchedule(board.canAccessSchedule())
                    .canAccessMilestone(board.canAccessMilestone())
                    .canAccessSlack(board.canAccessSlack())
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

    /**
     * 보드 진입 시 필요한 모든 데이터를 한 번에 반환하는 통합 응답
     * 기존 13개 개별 API 호출을 1개로 통합하여 서버 부하 감소
     */
    @Getter
    @Builder
    @AllArgsConstructor
    public static class Full {
        // 기본 보드 정보
        private String id;
        private String name;
        private String description;
        private OwnerInfo owner;
        private BoardRole myRole;
        private boolean isStarred;
        private int memberCount;
        private SubscriptionInfo subscription;
        private ScheduleSettings scheduleSettings;
        private String selectedMilestoneId;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        // 통합 데이터
        private List<BlockResponse.Detail> blocks;
        private List<FeatureResponse.Simple> features;
        private List<TaskResponse.Simple> tasks;
        private List<TagResponse.Detail> tags;
        private List<InviteResponse.Detail> inviteLinks;  // Admin+ 권한 없으면 빈 리스트
        private SubscriptionResponse.Detail subscriptionDetail;
        private ActivityResponse.ListResponse activities;
        private MemberResponse.ListResponse members;
        private MilestoneResponse.ListResponse milestones;
        private TierInfo tierInfo;
        private Limits limits;
        private AiCreditResponse.CreditInfo aiCredits;
    }
}
