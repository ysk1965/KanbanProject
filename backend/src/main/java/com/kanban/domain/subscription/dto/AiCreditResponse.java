package com.kanban.domain.subscription.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

public class AiCreditResponse {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CreditInfo {
        private Integer monthlyCredits;      // 월간 할당량
        private Integer monthlyUsed;         // 월간 사용량
        private Integer purchasedCredits;    // 추가 구매 잔여
        private Integer totalAvailable;      // 총 사용 가능 = (monthly - used) + purchased
        private LocalDateTime resetDate;     // 다음 리셋 일자
        private String warningLevel;         // null | "LOW" (≤10) | "CRITICAL" (≤3) | "EXHAUSTED" (0)
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
