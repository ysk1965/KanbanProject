package com.kanban.domain.subscription.dto;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class AiCreditResponse {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CreditInfo {
        private Integer monthlyCredits; // 월간 할당량
        private Integer monthlyUsed; // 월간 사용량
        private Integer purchasedCredits; // 추가 구매 잔여
        private Integer rewardCredits; // 달란트로 바꾼 리워드 잔여(만료 전, 개인 크레딧만)
        private LocalDateTime rewardExpiresAt; // 리워드 만료 시각(UTC)
        private Integer totalAvailable; // 총 사용 가능 = (monthly - used) + purchased
        private LocalDateTime resetDate; // 다음 리셋 일자
        private String warningLevel; // null | "LOW" (≤10) | "CRITICAL" (≤3) | "EXHAUSTED" (0)
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PurchaseResult {
        private String purchaseId;
        private Integer creditAmount;
        private Integer totalAmount;
        private CreditInfo updatedCredits;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PurchaseHistory {
        private String id;
        private Integer creditAmount;
        private Integer totalAmount;
        private String status;
        private LocalDateTime createdAt;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class UsageHistoryItem {
        private String id;
        private String userId;
        private String userName;
        private String featureType;
        private Integer creditsUsed;
        private LocalDateTime createdAt;
    }
}
