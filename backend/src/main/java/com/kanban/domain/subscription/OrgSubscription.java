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

    // Seat 기반 가격 상수 (KRW 단위)
    public static final int MONTHLY_PRICE_PER_SEAT = 1500;
    public static final int YEARLY_PRICE_PER_SEAT = 15000;
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
                .boardLimit(Integer.MAX_VALUE)
                .build();
    }

    // ── Business Methods ──

    public void activateTeam(BillingCycle cycle, int seats, String paymentMethodId) {
        this.plan = OrgPlan.TEAM;
        this.status = SubscriptionStatus.ACTIVE;
        this.billingCycle = cycle;
        this.seatCount = seats;
        this.pricePerSeat = cycle == BillingCycle.YEARLY
                ? YEARLY_PRICE_PER_SEAT
                : MONTHLY_PRICE_PER_SEAT;
        this.totalPrice = this.pricePerSeat * seats;
        this.paymentMethodId = paymentMethodId;
        this.boardLimit = Integer.MAX_VALUE;
        this.trialEndsAt = null;
        initializePeriod();
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
        if (plan == OrgPlan.FREE) return Integer.MAX_VALUE;
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
    }

    public void suspend() {
        this.status = SubscriptionStatus.SUSPENDED;
    }

    // ── Limit Methods ──

    public int getMemberLimit() {
        return Integer.MAX_VALUE;
    }

    public int getBoardLimit() {
        if (plan != OrgPlan.TEAM) return 0;
        if (!isActive() && !isTrialActive()) return 0;
        return Integer.MAX_VALUE;
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
