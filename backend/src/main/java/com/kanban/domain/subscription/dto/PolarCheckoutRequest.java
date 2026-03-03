package com.kanban.domain.subscription.dto;

import com.kanban.domain.subscription.BillingCycle;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

/**
 * Polar checkout request DTOs for different checkout types.
 */
public class PolarCheckoutRequest {

    /**
     * Request for creating a Board subscription checkout.
     * UC-001: POST /api/v1/checkout/board-subscription
     */
    @Getter
    @Setter
    public static class BoardSubscriptionCheckout {

        @NotBlank(message = "Board ID is required")
        private String boardId;

        @NotNull(message = "Billing cycle is required")
        private BillingCycle billingCycle;

        @Min(value = 1, message = "Seat count must be at least 1")
        private int seatCount;
    }

    /**
     * Request for creating an Organization subscription checkout.
     * UC-002: POST /api/v1/checkout/org-subscription
     */
    @Getter
    @Setter
    public static class OrgSubscriptionCheckout {

        @NotBlank(message = "Organization ID is required")
        private String orgId;

        @NotNull(message = "Billing cycle is required")
        private BillingCycle billingCycle;

        @Min(value = 1, message = "Seat count must be at least 1")
        private int seatCount;
    }

    /**
     * Request for creating an AI credit purchase checkout.
     * UC-003: POST /api/v1/checkout/ai-credits
     */
    @Getter
    @Setter
    public static class AiCreditCheckout {

        @NotBlank(message = "Board ID is required")
        private String boardId;

        @Min(value = 100, message = "Credit amount must be at least 100")
        private int creditAmount;
    }

    /**
     * Request for creating a seat purchase checkout.
     * UC-004: POST /api/v1/checkout/seats
     */
    @Getter
    @Setter
    public static class SeatCheckout {

        @NotBlank(message = "Board ID is required")
        private String boardId;

        @Min(value = 1, message = "Additional seats must be at least 1")
        private int additionalSeats;
    }
}
