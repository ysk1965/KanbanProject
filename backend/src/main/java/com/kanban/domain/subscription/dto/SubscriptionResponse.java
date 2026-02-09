package com.kanban.domain.subscription.dto;

import com.kanban.domain.subscription.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class SubscriptionResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private SubscriptionStatus status;
        private String plan;
        private BillingCycle billingCycle;
        private Integer price;
        private LocalDateTime trialEndsAt;
        private LocalDateTime graceEndsAt;
        private LocalDateTime currentPeriodStart;
        private LocalDateTime currentPeriodEnd;
        private Integer billableMemberCount;
        private Integer memberLimit;
        private Integer seatCount;
        private Integer pricePerSeat;
        private LocalDateTime nextPaymentAt;
        private LocalDateTime createdAt;

        public static Detail of(Subscription subscription) {
            return Detail.builder()
                    .id(subscription.getId())
                    .status(subscription.getStatus())
                    .plan(subscription.getPlan())
                    .billingCycle(subscription.getBillingCycle())
                    .price(subscription.getPrice())
                    .trialEndsAt(subscription.getTrialEndsAt())
                    .graceEndsAt(subscription.getGraceEndsAt())
                    .currentPeriodStart(subscription.getCurrentPeriodStart())
                    .currentPeriodEnd(subscription.getCurrentPeriodEnd())
                    .billableMemberCount(subscription.getBillableMemberCount())
                    .memberLimit(subscription.getMemberLimit())
                    .seatCount(subscription.getSeatCount())
                    .pricePerSeat(subscription.getPricePerSeat())
                    .nextPaymentAt(subscription.getNextPaymentAt())
                    .createdAt(subscription.getCreatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PricingInfo {
        private String id;
        private String name;
        private Integer minMembers;
        private Integer maxMembers;
        private Integer monthlyPrice;
        private Integer yearlyPrice;
        private Integer yearlyMonthlyPrice;
        private Integer discountPercentage;

        public static PricingInfo of(PricingPlan plan) {
            return PricingInfo.builder()
                    .id(plan.getId())
                    .name(plan.getName())
                    .minMembers(plan.getMinMembers())
                    .maxMembers(plan.getMaxMembers())
                    .monthlyPrice(plan.getMonthlyPrice())
                    .yearlyPrice(plan.getYearlyPrice())
                    .yearlyMonthlyPrice(plan.getYearlyMonthlyPrice())
                    .discountPercentage(plan.getDiscountPercentage())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class PricingListResponse {
        private List<PricingInfo> plans;
        private String currency;
        private String trialDays;

        public static PricingListResponse of(List<PricingPlan> plans) {
            return PricingListResponse.builder()
                    .plans(plans.stream().map(PricingInfo::of).toList())
                    .currency("KRW")
                    .trialDays("7")
                    .build();
        }
    }
}
