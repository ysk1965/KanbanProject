package com.kanban.domain.subscription.dto;

import com.kanban.domain.subscription.BillingCycle;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class SubscriptionRequest {

    @Getter
    @NoArgsConstructor
    public static class Start {
        @NotBlank(message = "플랜 ID는 필수입니다")
        private String planId;

        @NotNull(message = "결제 주기는 필수입니다")
        private BillingCycle billingCycle;

        private String paymentMethodId;
    }

    @Getter
    @NoArgsConstructor
    public static class ChangePlan {
        @NotBlank(message = "플랜 ID는 필수입니다")
        private String planId;

        @NotNull(message = "결제 주기는 필수입니다")
        private BillingCycle billingCycle;
    }
}
