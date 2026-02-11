package com.kanban.domain.subscription.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class TossPaymentResponse {

    @JsonProperty("paymentKey")
    private String paymentKey;

    @JsonProperty("orderId")
    private String orderId;

    @JsonProperty("status")
    private String status;

    @JsonProperty("method")
    private String method;

    @JsonProperty("totalAmount")
    private int totalAmount;

    @JsonProperty("approvedAt")
    private String approvedAt;

    @JsonProperty("requestedAt")
    private String requestedAt;

    @JsonProperty("receipt")
    private Receipt receipt;

    @Getter
    @NoArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Receipt {
        @JsonProperty("url")
        private String url;
    }
}
