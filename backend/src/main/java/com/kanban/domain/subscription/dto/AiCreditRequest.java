package com.kanban.domain.subscription.dto;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class AiCreditRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Purchase {
        @NotNull
        private Integer creditAmount;  // 100 단위

        private String paymentKey;

        private String orderId;

        @NotNull
        private Integer amount;  // 결제 금액 (원)
    }
}
