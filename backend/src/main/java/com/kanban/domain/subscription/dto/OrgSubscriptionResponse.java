package com.kanban.domain.subscription.dto;

import com.kanban.domain.subscription.OrgSubscription;
import com.kanban.domain.subscription.SubscriptionStatus;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

public record OrgSubscriptionResponse(
    String id,
    String organizationId,
    String plan,
    String status,
    String billingCycle,
    int seatCount,
    int activeMemberCount,
    int pricePerSeat,
    int totalPrice,
    String currency,
    String currentPeriodStart,
    String currentPeriodEnd,
    String nextPaymentAt,
    String trialEndsAt,
    int boardLimit,
    int boardCount,
    int memberLimit,
    boolean canAccessPremiumBoardFeatures,
    boolean canAccessHrFeatures,
    boolean canReadHrData,
    boolean canCreateOrgBoard,
    boolean trialUsed,
    String cancelRequestedAt,
    String pastDueSince,
    Integer daysPastDue,
    Integer daysUntilSuspension,
    // AI Credit Pool
    int monthlyAiCredits,
    int monthlyCreditsUsed,
    int totalAvailableCredits,
    String creditsResetDate,
    String creditWarningLevel
) {
    public static OrgSubscriptionResponse from(OrgSubscription sub, int boardCount) {
        Integer daysPastDue = null;
        Integer daysUntilSuspension = null;
        if (sub.getPastDueSince() != null
                && sub.getStatus() == SubscriptionStatus.PAST_DUE) {
            long days = ChronoUnit.DAYS.between(sub.getPastDueSince(),
                    LocalDateTime.now(ZoneOffset.UTC));
            daysPastDue = (int) days;
            daysUntilSuspension = Math.max(0, 7 - daysPastDue);
        }

        return new OrgSubscriptionResponse(
            sub.getId(),
            sub.getOrganization().getId(),
            sub.getPlan().name(),
            sub.getStatus().name(),
            sub.getBillingCycle() != null ? sub.getBillingCycle().name() : null,
            sub.getSeatCount(),
            sub.getActiveMemberCount(),
            sub.getPricePerSeat(),
            sub.getTotalPrice(),
            "USD",
            sub.getCurrentPeriodStart() != null ? sub.getCurrentPeriodStart().toString() : null,
            sub.getCurrentPeriodEnd() != null ? sub.getCurrentPeriodEnd().toString() : null,
            sub.getNextPaymentAt() != null ? sub.getNextPaymentAt().toString() : null,
            sub.getTrialEndsAt() != null ? sub.getTrialEndsAt().toString() : null,
            sub.getBoardLimit(),
            boardCount,
            sub.getMemberLimit(),
            sub.canAccessPremiumBoardFeatures(),
            sub.canAccessHrFeatures(),
            sub.canReadHrData(),
            sub.canCreateOrgBoard(),
            sub.getOrganization().getTrialUsed() != null && sub.getOrganization().getTrialUsed(),
            sub.getCancelRequestedAt() != null ? sub.getCancelRequestedAt().toString() : null,
            sub.getPastDueSince() != null ? sub.getPastDueSince().toString() : null,
            daysPastDue,
            daysUntilSuspension,
            sub.getMonthlyAiCredits() != null ? sub.getMonthlyAiCredits() : 0,
            sub.getMonthlyCreditsUsed() != null ? sub.getMonthlyCreditsUsed() : 0,
            sub.getTotalAvailableCredits(),
            sub.getCreditsResetDate() != null ? sub.getCreditsResetDate().toString() : null,
            sub.getWarningLevel()
        );
    }
}
