package com.kanban.domain.subscription;

import com.kanban.domain.board.Board;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "subscriptions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Subscription {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false, unique = true)
    private Board board;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private SubscriptionStatus status = SubscriptionStatus.TRIAL;

    @Column(name = "plan", length = 20)
    private String plan;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_cycle", length = 20)
    private BillingCycle billingCycle;

    @Column(name = "price")
    private Integer price;

    @Column(name = "trial_ends_at")
    private LocalDateTime trialEndsAt;

    @Column(name = "grace_ends_at")
    private LocalDateTime graceEndsAt;

    @Column(name = "current_period_start")
    private LocalDateTime currentPeriodStart;

    @Column(name = "current_period_end")
    private LocalDateTime currentPeriodEnd;

    @Column(name = "billable_member_count")
    @Builder.Default
    private Integer billableMemberCount = 1;

    @Column(name = "payment_method_id", length = 100)
    private String paymentMethodId;

    @Column(name = "next_payment_at")
    private LocalDateTime nextPaymentAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now();
        }
    }

    public static Subscription createTrial(Board board) {
        return Subscription.builder()
                .board(board)
                .status(SubscriptionStatus.TRIAL)
                .trialEndsAt(LocalDateTime.now().plusDays(7))
                .billableMemberCount(1)
                .build();
    }

    public boolean isActive() {
        return this.status == SubscriptionStatus.ACTIVE;
    }

    public boolean isTrial() {
        return this.status == SubscriptionStatus.TRIAL;
    }

    public boolean isGrace() {
        return this.status == SubscriptionStatus.GRACE;
    }

    public boolean isSuspended() {
        return this.status == SubscriptionStatus.SUSPENDED;
    }

    public boolean canPerformActions() {
        return this.status != SubscriptionStatus.SUSPENDED;
    }

    public void activateSubscription(String plan, BillingCycle billingCycle, Integer price, String paymentMethodId) {
        this.status = SubscriptionStatus.ACTIVE;
        this.plan = plan;
        this.billingCycle = billingCycle;
        this.price = price;
        this.paymentMethodId = paymentMethodId;
        this.currentPeriodStart = LocalDateTime.now();
        this.currentPeriodEnd = billingCycle == BillingCycle.YEARLY
                ? LocalDateTime.now().plusYears(1)
                : LocalDateTime.now().plusMonths(1);
        this.nextPaymentAt = this.currentPeriodEnd;
    }

    public void enterGracePeriod() {
        this.status = SubscriptionStatus.GRACE;
        this.graceEndsAt = LocalDateTime.now().plusDays(3);
    }

    public void suspend() {
        this.status = SubscriptionStatus.SUSPENDED;
    }

    public void cancel() {
        this.status = SubscriptionStatus.CANCELED;
    }

    public void updateBillableMemberCount(int count) {
        this.billableMemberCount = count;
    }

    public void updatePlan(String plan, BillingCycle billingCycle, Integer price) {
        this.plan = plan;
        this.billingCycle = billingCycle;
        this.price = price;
    }

    public int getMemberLimit() {
        // Trial: 5명, Active: plan에 따라 다름, 기본 15명
        if (isTrial()) {
            return 5;
        }
        // 추후 plan별 멤버 수 제한 로직 추가
        return 15;
    }
}
