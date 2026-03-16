package com.kanban.domain.subscription;

import com.kanban.domain.organization.Organization;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "org_subscriptions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OrgSubscription {

    // Seat 기반 가격 상수 (USD cents)
    public static final int MONTHLY_PRICE_PER_SEAT = 1500;   // $15.00
    public static final int YEARLY_PRICE_PER_SEAT = 15000;   // $150.00
    public static final int TRIAL_DAYS = 7;

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id", nullable = false, unique = true)
    private Organization organization;

    @Enumerated(EnumType.STRING)
    @Column(name = "plan", nullable = false, length = 20)
    @Builder.Default
    private OrgPlan plan = OrgPlan.FREE;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private SubscriptionStatus status = SubscriptionStatus.ACTIVE;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_cycle", length = 10)
    private BillingCycle billingCycle;

    @Column(name = "seat_count")
    @Builder.Default
    private int seatCount = 0;

    @Column(name = "active_member_count")
    @Builder.Default
    private int activeMemberCount = 0;

    @Column(name = "price_per_seat")
    @Builder.Default
    private int pricePerSeat = 0;

    @Column(name = "total_price")
    @Builder.Default
    private int totalPrice = 0;

    @Column(name = "current_period_start")
    private LocalDateTime currentPeriodStart;

    @Column(name = "current_period_end")
    private LocalDateTime currentPeriodEnd;

    @Column(name = "next_payment_at")
    private LocalDateTime nextPaymentAt;

    @Column(name = "payment_method_id", length = 100)
    private String paymentMethodId;

    @Column(name = "trial_ends_at")
    private LocalDateTime trialEndsAt;

    @Column(name = "board_limit")
    @Builder.Default
    private int boardLimit = 0;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "canceled_at")
    private LocalDateTime canceledAt;

    @Column(name = "cancel_requested_at")
    private LocalDateTime cancelRequestedAt;

    @Column(name = "past_due_since")
    private LocalDateTime pastDueSince;

    // ── AI Credit Pool (Organization 레벨 공유 크레딧) ──

    @Column(name = "monthly_ai_credits")
    @Builder.Default
    private Integer monthlyAiCredits = 0;

    @Column(name = "monthly_credits_used")
    @Builder.Default
    private Integer monthlyCreditsUsed = 0;

    @Column(name = "credits_reset_date")
    private LocalDateTime creditsResetDate;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (this.createdAt == null) {
            this.createdAt = now;
        }
        if (this.updatedAt == null) {
            this.updatedAt = now;
        }
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    // ── Factory Methods ──

    public static OrgSubscription createFree(Organization org) {
        return OrgSubscription.builder()
                .organization(org)
                .plan(OrgPlan.FREE)
                .status(SubscriptionStatus.ACTIVE)
                .boardLimit(0)
                .build();
    }

    public static OrgSubscription createTrial(Organization org) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        return OrgSubscription.builder()
                .organization(org)
                .plan(OrgPlan.TEAM)
                .status(SubscriptionStatus.TRIAL)
                .trialEndsAt(now.plusDays(TRIAL_DAYS))
                .boardLimit(-1)
                .monthlyAiCredits(ORG_MONTHLY_CREDITS)
                .monthlyCreditsUsed(0)
                .creditsResetDate(now.plusMonths(1))
                .build();
    }

    public static OrgSubscription createActive(Organization org) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        return OrgSubscription.builder()
                .organization(org)
                .plan(OrgPlan.TEAM)
                .status(SubscriptionStatus.ACTIVE)
                .boardLimit(-1)
                .monthlyAiCredits(ORG_MONTHLY_CREDITS)
                .monthlyCreditsUsed(0)
                .creditsResetDate(now.plusMonths(1))
                .build();
    }

    // ── Business Methods ──

    public void activateTeam(BillingCycle cycle, int seats, String paymentMethodId) {
        this.plan = OrgPlan.TEAM;
        this.status = SubscriptionStatus.ACTIVE;
        this.pastDueSince = null;
        this.billingCycle = cycle;
        this.seatCount = seats;
        this.pricePerSeat = cycle == BillingCycle.YEARLY
                ? YEARLY_PRICE_PER_SEAT
                : MONTHLY_PRICE_PER_SEAT;
        this.totalPrice = this.pricePerSeat * seats;
        this.paymentMethodId = paymentMethodId;
        this.boardLimit = -1;
        this.trialEndsAt = null;
        initializePeriod();
        initializeCredits(ORG_MONTHLY_CREDITS);
    }

    public void expireTrialToFree() {
        this.plan = OrgPlan.FREE;
        this.status = SubscriptionStatus.ACTIVE;
        this.trialEndsAt = null;
        this.boardLimit = 0;
        this.seatCount = 0;
        this.totalPrice = 0;
    }

    // ── Access Methods ──

    public boolean canAccessPremiumBoardFeatures() {
        return plan == OrgPlan.TEAM && (isActive() || isTrialActive());
    }

    public boolean canAccessHrFeatures() {
        return (plan == OrgPlan.TEAM && isActive()) || isTrialActive();
    }

    public boolean canReadHrData() {
        return true;
    }

    public boolean canCreateOrgBoard() {
        return plan == OrgPlan.TEAM && isActive();
    }

    // ── Seat Methods ──

    public void updateSeatCount(int newSeatCount) {
        this.seatCount = newSeatCount;
        this.totalPrice = this.pricePerSeat * newSeatCount;
    }

    public boolean canInviteMember() {
        if (plan == OrgPlan.FREE) return true;
        return activeMemberCount < seatCount;
    }

    public int getAvailableSeats() {
        if (plan == OrgPlan.FREE) return -1;  // FREE는 unlimited
        return Math.max(0, seatCount - activeMemberCount);
    }

    // ── Status Methods ──

    public boolean isActive() {
        return this.status == SubscriptionStatus.ACTIVE;
    }

    public boolean isTrial() {
        return this.status == SubscriptionStatus.TRIAL;
    }

    public boolean isTrialActive() {
        return this.status == SubscriptionStatus.TRIAL
                && this.trialEndsAt != null
                && LocalDateTime.now(ZoneOffset.UTC).isBefore(this.trialEndsAt);
    }

    public void cancel() {
        this.status = SubscriptionStatus.CANCELED;
        this.canceledAt = LocalDateTime.now(ZoneOffset.UTC);
        this.cancelRequestedAt = null;
    }

    public void requestCancellation() {
        this.cancelRequestedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public boolean isCancellationRequested() {
        return this.cancelRequestedAt != null;
    }

    public void undoCancellation() {
        this.cancelRequestedAt = null;
    }

    public void markPastDue() {
        this.status = SubscriptionStatus.PAST_DUE;
        if (this.pastDueSince == null) {
            this.pastDueSince = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public boolean isPastDue() {
        return this.status == SubscriptionStatus.PAST_DUE;
    }

    public void suspend() {
        this.status = SubscriptionStatus.SUSPENDED;
        this.pastDueSince = null;
    }

    // ── Limit Methods ──

    public int getMemberLimit() {
        return -1;  // Org는 항상 unlimited members
    }

    public int getBoardLimit() {
        if (plan != OrgPlan.TEAM) return 0;
        if (!isActive() && !isTrialActive()) return 0;
        return -1;  // TEAM 플랜은 unlimited boards
    }

    // ── AI Credit Methods ──

    public static final int ORG_MONTHLY_CREDITS = 200;

    public int getTotalAvailableCredits() {
        return Math.max(0, safeCredits(monthlyAiCredits) - safeCredits(monthlyCreditsUsed));
    }

    public boolean hasEnoughCredits(int required) {
        return getTotalAvailableCredits() >= required;
    }

    public void consumeCredits(int amount) {
        this.monthlyCreditsUsed = safeCredits(this.monthlyCreditsUsed) + amount;
    }

    public void refundCredits(int amount) {
        this.monthlyCreditsUsed = Math.max(0, safeCredits(this.monthlyCreditsUsed) - amount);
    }

    public void resetMonthlyCredits() {
        this.monthlyCreditsUsed = 0;
        this.creditsResetDate = LocalDateTime.now(ZoneOffset.UTC).plusMonths(1);
    }

    public void initializeCredits(int monthlyAmount) {
        this.monthlyAiCredits = monthlyAmount;
        this.monthlyCreditsUsed = 0;
        this.creditsResetDate = LocalDateTime.now(ZoneOffset.UTC).plusMonths(1);
    }

    public String getWarningLevel() {
        int available = getTotalAvailableCredits();
        if (available <= 0) return "EXHAUSTED";
        if (available <= 3) return "CRITICAL";
        if (available <= 10) return "LOW";
        return null;
    }

    private int safeCredits(Integer value) {
        return value != null ? value : 0;
    }

    // ── Private ──

    private void initializePeriod() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        this.currentPeriodStart = now;
        this.currentPeriodEnd = billingCycle == BillingCycle.YEARLY
                ? now.plusYears(1)
                : now.plusMonths(1);
        this.nextPaymentAt = this.currentPeriodEnd;
    }
}
