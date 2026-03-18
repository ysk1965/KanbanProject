package com.kanban.domain.admin.dto;

import com.kanban.domain.announcement.AnnouncementType;
import com.kanban.domain.board.BoardRole;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.subscription.BillingCycle;
import com.kanban.domain.user.SystemRole;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

public class AdminRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateUser {
        @NotNull(message = "시스템 역할은 필수입니다")
        private SystemRole systemRole;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateBoardTier {
        @NotNull(message = "Tier는 필수입니다")
        private BoardTier tier;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DeactivateUser {
        private String reason;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TransferOwnership {
        @NotBlank(message = "새 소유자 ID는 필수입니다")
        private String newOwnerId;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ExtendTrial {
        @Min(value = 1, message = "연장 일수는 최소 1일 이상이어야 합니다")
        private Integer extendDays;
        private LocalDateTime newTrialEndsAt;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateAnnouncement {
        @NotBlank(message = "제목은 필수입니다")
        private String title;
        private String content;
        private AnnouncementType type;
        private Boolean isActive;
        private LocalDateTime startAt;
        private LocalDateTime endAt;
        private Integer priority;
        private String targetRole;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateBoardName {
        @NotBlank(message = "보드 이름은 필수입니다")
        private String name;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateSeatCount {
        @NotNull(message = "시트 수는 필수입니다")
        @Min(value = 1, message = "시트 수는 최소 1 이상이어야 합니다")
        private Integer seatCount;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SetMaintenance {
        @NotNull(message = "활성화 여부는 필수입니다")
        private Boolean enabled;
        private String message;
        private LocalDateTime estimatedEndAt;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateMemberRole {
        @NotNull(message = "역할은 필수입니다")
        private BoardRole role;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AdjustAiCredits {
        private Integer monthlyAiCredits;
        private Integer addPurchasedCredits;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AdjustPersonalAiCredits {
        private Integer personalAiCredits;
        private Integer addBonusCredits;
    }

    // ==================== Organizations ====================

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateOrganization {
        private String name;
        private String description;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TransferOrgOwnership {
        @NotBlank(message = "새 소유자 멤버 ID는 필수입니다")
        private String newOwnerMemberId;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateOrgSubscription {
        private String plan;
        private String status;
        private BillingCycle billingCycle;
        private Integer seatCount;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ExtendOrgTrial {
        @Min(value = 1, message = "연장 일수는 최소 1일 이상이어야 합니다")
        private Integer extendDays;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AdjustOrgAiCredits {
        private Integer monthlyAiCredits;
        private Boolean resetUsedCredits;
        private Integer addBonusCredits;
    }
}
