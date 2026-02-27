package com.kanban.domain.subscription.dto;

import com.kanban.domain.subscription.OrgSubscription;

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
    boolean trialUsed
) {
    public static OrgSubscriptionResponse from(OrgSubscription sub, int boardCount) {
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
            sub.getOrganization().getTrialUsed() != null && sub.getOrganization().getTrialUsed()
        );
    }
}
