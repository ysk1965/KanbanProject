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
}
