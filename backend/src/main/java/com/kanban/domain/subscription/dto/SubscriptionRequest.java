package com.kanban.domain.subscription.dto;

import com.kanban.domain.subscription.BillingCycle;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class SubscriptionRequest {

    @Getter
    @NoArgsConstructor
    public static class Start {
        private String planId; // optional, 시트 기반에서는 사용 안 함

        @NotNull(message = "결제 주기는 필수입니다")
        private BillingCycle billingCycle;

        @Min(value = 1, message = "최소 1개 이상의 시트가 필요합니다")
        private Integer seatCount;

        private String paymentMethodId;
    }

    @Getter
    @NoArgsConstructor
    public static class ChangePlan {
        private String planId; // optional, 시트 기반에서는 사용 안 함

        @NotNull(message = "결제 주기는 필수입니다")
        private BillingCycle billingCycle;
    }

    @Getter
    @NoArgsConstructor
    public static class PurchaseSeats {
        @NotNull(message = "추가 시트 수는 필수입니다")
        @Min(value = 1, message = "최소 1개 이상의 시트를 구매해야 합니다")
        private Integer additionalSeats;
    }
}
