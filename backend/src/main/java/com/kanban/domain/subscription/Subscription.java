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

    // grace_ends_at 컬럼은 더 이상 사용하지 않음 (GRACE 상태 제거)

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

    @Column(name = "monthly_ai_credits")
    @Builder.Default
    private Integer monthlyAiCredits = 0;

    @Column(name = "monthly_credits_used")
    @Builder.Default
    private Integer monthlyCreditsUsed = 0;

    @Column(name = "purchased_credits")
    @Builder.Default
    private Integer purchasedCredits = 0;

    @Column(name = "credits_reset_date")
    private LocalDateTime creditsResetDate;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    @PostLoad
    private void initCreditDefaults() {
        if (this.monthlyAiCredits == null) this.monthlyAiCredits = 0;
        if (this.monthlyCreditsUsed == null) this.monthlyCreditsUsed = 0;
        if (this.purchasedCredits == null) this.purchasedCredits = 0;
    }

    public static Subscription createTrial(Board board) {
        return Subscription.builder()
                .board(board)
                .status(SubscriptionStatus.TRIAL)
                .trialEndsAt(LocalDateTime.now(ZoneOffset.UTC).plusDays(7))
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
        this.trialEndsAt = LocalDateTime.now(ZoneOffset.UTC).plusDays(7);
    }

    public boolean isActive() {
        return this.status == SubscriptionStatus.ACTIVE;
    }

    public boolean isTrial() {
        return this.status == SubscriptionStatus.TRIAL;
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

    // AI Credit Management Methods

    /**
     * 총 사용 가능 크레딧
     */
    public int getTotalAvailableCredits() {
        int monthlyRemaining = Math.max(0, monthlyAiCredits - monthlyCreditsUsed);
        return monthlyRemaining + purchasedCredits;
    }

    /**
     * 크레딧 충분 여부
     */
    public boolean hasEnoughCredits(int required) {
        return getTotalAvailableCredits() >= required;
    }

    /**
     * 크레딧 차감 (월간 → 구매 순서)
     */
    public void consumeCredits(int amount) {
        int monthlyRemaining = Math.max(0, monthlyAiCredits - monthlyCreditsUsed);
        if (monthlyRemaining >= amount) {
            this.monthlyCreditsUsed += amount;
        } else {
            // 월간 잔여 먼저 소진, 나머지는 구매 크레딧에서
            this.monthlyCreditsUsed = this.monthlyAiCredits;
            int fromPurchased = amount - monthlyRemaining;
            this.purchasedCredits = Math.max(0, this.purchasedCredits - fromPurchased);
        }
    }

    /**
     * 크레딧 소비 소스 반환 (로깅용)
     */
    public String getCreditSource(int amount) {
        int monthlyRemaining = Math.max(0, monthlyAiCredits - monthlyCreditsUsed);
        if (monthlyRemaining >= amount) return "MONTHLY";
        if (monthlyRemaining > 0) return "MIXED";
        return "PURCHASED";
    }

    /**
     * 월간 크레딧 리셋
     */
    public void resetMonthlyCredits() {
        this.monthlyCreditsUsed = 0;
        this.creditsResetDate = LocalDateTime.now(ZoneOffset.UTC).plusMonths(1);
    }

    /**
     * 크레딧 초기화 (구독 시작/변경 시)
     */
    public void initializeCredits(int monthlyAmount) {
        this.monthlyAiCredits = monthlyAmount;
        this.monthlyCreditsUsed = 0;
        this.creditsResetDate = LocalDateTime.now(ZoneOffset.UTC).plusMonths(1);
    }

    /**
     * 구매 크레딧 추가
     */
    public void addPurchasedCredits(int amount) {
        this.purchasedCredits += amount;
    }

    /**
     * 경고 레벨
     */
    public String getWarningLevel() {
        int available = getTotalAvailableCredits();
        if (available <= 0) return "EXHAUSTED";
        if (available <= 3) return "CRITICAL";
        if (available <= 10) return "LOW";
        return null;
    }
}
