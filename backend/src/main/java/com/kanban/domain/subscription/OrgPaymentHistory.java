package com.kanban.domain.subscription;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "org_payment_history")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OrgPaymentHistory {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "org_subscription_id", nullable = false)
    private OrgSubscription orgSubscription;

    @Column(name = "amount", nullable = false)
    private int amount;

    @Column(name = "credit_applied", nullable = false)
    @Builder.Default
    private int creditApplied = 0;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_cycle", length = 10)
    private BillingCycle billingCycle;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private PaymentStatus status = PaymentStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_type", nullable = false, length = 20)
    private OrgPaymentType paymentType;

    @Column(name = "pg_provider", length = 50)
    private String pgProvider;

    @Column(name = "pg_transaction_id", length = 100)
    private String pgTransactionId;

    @Column(name = "period_start", nullable = false)
    private LocalDateTime periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDateTime periodEnd;

    @Column(name = "member_count", nullable = false)
    private int memberCount;

    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public static OrgPaymentHistory create(OrgSubscription sub, int amount, int creditApplied, OrgPaymentType type) {
        return OrgPaymentHistory.builder()
                .orgSubscription(sub)
                .amount(amount)
                .creditApplied(creditApplied)
                .billingCycle(sub.getBillingCycle())
                .paymentType(type)
                .periodStart(sub.getCurrentPeriodStart())
                .periodEnd(sub.getCurrentPeriodEnd())
                .memberCount(sub.getActiveMemberCount())
                .build();
    }
}
