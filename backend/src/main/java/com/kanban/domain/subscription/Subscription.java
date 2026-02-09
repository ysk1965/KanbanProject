package com.kanban.domain.subscription;

import com.kanban.domain.board.Board;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "subscriptions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Subscription {

    // Seat 기반 가격 상수 (USD 센트 단위)
    public static final int MONTHLY_PRICE_PER_SEAT = 500;  // $5.00
    public static final int YEARLY_PRICE_PER_SEAT = 5000;  // $50.00 (17% 할인)

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

    @Column(name = "price_per_seat")
    private Integer pricePerSeat;

    @Column(name = "seat_count")
    @Builder.Default
    private Integer seatCount = 1;

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
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public static Subscription createTrial(Board board) {
        return Subscription.builder()
                .board(board)
                .status(SubscriptionStatus.TRIAL)
                .trialEndsAt(LocalDateTime.now(ZoneOffset.UTC).plusDays(3))
                .billableMemberCount(1)
                .build();
    }

    public static Subscription createPremium(Board board) {
        return Subscription.builder()
                .board(board)
                .status(SubscriptionStatus.ACTIVE)
                .plan("PREMIUM")
                .billableMemberCount(1)
                .build();
    }

    /**
     * Admin에 의한 PREMIUM 전환 시 구독 상태 동기화
     */
    public void upgradeByAdmin() {
        this.status = SubscriptionStatus.ACTIVE;
        this.plan = "PREMIUM";
        this.trialEndsAt = null;
    }

    /**
     * Admin에 의한 STANDARD 전환 시 구독 상태 동기화
     */
    public void downgradeByAdmin() {
        this.status = SubscriptionStatus.TRIAL;
        this.plan = null;
        this.trialEndsAt = LocalDateTime.now(ZoneOffset.UTC).plusDays(3);
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
        this.currentPeriodStart = LocalDateTime.now(ZoneOffset.UTC);
        this.currentPeriodEnd = billingCycle == BillingCycle.YEARLY
                ? LocalDateTime.now(ZoneOffset.UTC).plusYears(1)
                : LocalDateTime.now(ZoneOffset.UTC).plusMonths(1);
        this.nextPaymentAt = this.currentPeriodEnd;
    }

    /**
     * Seat 기반 구독 활성화
     */
    public void activateSeatSubscription(BillingCycle billingCycle, int seatCount, String paymentMethodId) {
        this.status = SubscriptionStatus.ACTIVE;
        this.plan = "PREMIUM";
        this.billingCycle = billingCycle;
        this.seatCount = seatCount;
        this.pricePerSeat = billingCycle == BillingCycle.YEARLY
                ? YEARLY_PRICE_PER_SEAT
                : MONTHLY_PRICE_PER_SEAT;
        this.price = calculateTotalPrice();
        this.paymentMethodId = paymentMethodId;
        this.currentPeriodStart = LocalDateTime.now(ZoneOffset.UTC);
        this.currentPeriodEnd = billingCycle == BillingCycle.YEARLY
                ? LocalDateTime.now(ZoneOffset.UTC).plusYears(1)
                : LocalDateTime.now(ZoneOffset.UTC).plusMonths(1);
        this.nextPaymentAt = this.currentPeriodEnd;
    }

    /**
     * 총 가격 계산 (seatCount * pricePerSeat)
     */
    public int calculateTotalPrice() {
        if (this.pricePerSeat == null || this.seatCount == null) {
            return 0;
        }
        return this.pricePerSeat * this.seatCount;
    }

    /**
     * Seat 수 업데이트 및 가격 재계산
     */
    public void updateSeatCount(int seatCount) {
        this.seatCount = seatCount;
        this.price = calculateTotalPrice();
    }

    public void enterGracePeriod() {
        this.status = SubscriptionStatus.GRACE;
        this.graceEndsAt = LocalDateTime.now(ZoneOffset.UTC).plusDays(3);
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
        if (isTrial()) {
            return 5;
        }
        // Seat 기반: 구매한 시트 수가 곧 멤버 제한
        if (this.seatCount != null && this.seatCount > 0) {
            return this.seatCount;
        }
        return 5; // fallback
    }
}
