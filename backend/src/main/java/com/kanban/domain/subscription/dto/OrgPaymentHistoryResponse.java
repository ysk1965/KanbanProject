package com.kanban.domain.subscription.dto;

import com.kanban.domain.subscription.OrgPaymentHistory;

import java.time.LocalDateTime;

/**
 * 조직 결제 이력 응답. 엔티티를 직접 직렬화하면 LAZY orgSubscription 프록시가 노출되므로 DTO로 변환한다.
 * 필드명은 기존 엔티티 직렬화 결과(snake_case)와 동일하게 유지해 FE 호환성을 지킨다.
 */
public record OrgPaymentHistoryResponse(
        String id,
        String orgSubscriptionId,
        int amount,
        int creditApplied,
        String billingCycle,
        String status,
        String paymentType,
        String pgProvider,
        String pgTransactionId,
        LocalDateTime periodStart,
        LocalDateTime periodEnd,
        int memberCount,
        LocalDateTime paidAt,
        LocalDateTime createdAt
) {
    public static OrgPaymentHistoryResponse from(OrgPaymentHistory h) {
        return new OrgPaymentHistoryResponse(
                h.getId(),
                h.getOrgSubscription() != null ? h.getOrgSubscription().getId() : null,
                h.getAmount(),
                h.getCreditApplied(),
                h.getBillingCycle() != null ? h.getBillingCycle().name() : null,
                h.getStatus() != null ? h.getStatus().name() : null,
                h.getPaymentType() != null ? h.getPaymentType().name() : null,
                h.getPgProvider(),
                h.getPgTransactionId(),
                h.getPeriodStart(),
                h.getPeriodEnd(),
                h.getMemberCount(),
                h.getPaidAt(),
                h.getCreatedAt()
        );
    }
}
