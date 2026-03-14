package com.kanban.domain.subscription;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface OrgSubscriptionRepository extends JpaRepository<OrgSubscription, String> {

    @Query("SELECT os FROM OrgSubscription os JOIN FETCH os.organization WHERE os.organization.id = :orgId")
    Optional<OrgSubscription> findByOrganizationId(@Param("orgId") String orgId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT os FROM OrgSubscription os JOIN FETCH os.organization WHERE os.organization.id = :orgId")
    Optional<OrgSubscription> findByOrganizationIdForUpdate(@Param("orgId") String orgId);

    List<OrgSubscription> findByStatusAndTrialEndsAtBefore(SubscriptionStatus status, LocalDateTime now);

    List<OrgSubscription> findByStatusAndNextPaymentAtBefore(SubscriptionStatus status, LocalDateTime now);

    @Query("SELECT os FROM OrgSubscription os JOIN FETCH os.organization WHERE os.cancelRequestedAt IS NOT NULL AND os.currentPeriodEnd < :now AND os.status = 'ACTIVE'")
    List<OrgSubscription> findPendingCancellations(@Param("now") LocalDateTime now);

    @Query("SELECT os FROM OrgSubscription os JOIN FETCH os.organization WHERE os.status = 'PAST_DUE' AND os.pastDueSince < :threshold")
    List<OrgSubscription> findByStatusPastDueAndPastDueSinceBefore(@Param("threshold") LocalDateTime threshold);

    @Query("SELECT os FROM OrgSubscription os WHERE os.creditsResetDate IS NOT NULL AND os.creditsResetDate <= :now")
    List<OrgSubscription> findDueForCreditReset(@Param("now") LocalDateTime now);

    /**
     * FREE 플랜이거나 TRIAL 상태인 Org 구독 조회 (Monetization Toggle용)
     */
    @Query("SELECT os FROM OrgSubscription os WHERE os.plan = :plan OR os.status = :status")
    List<OrgSubscription> findByPlanOrStatus(@Param("plan") OrgPlan plan, @Param("status") SubscriptionStatus status);
}
