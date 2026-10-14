package com.kanban.domain.subscription;

import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PolarWebhookDeliveryRepository extends JpaRepository<PolarWebhookDelivery, String> {

    /**
     * FAILED 이거나 오래 멈춘 PROCESSING 행을 다시 선점한다. {@code attempts} 가 읽었을 때와 같을 때만
     * 갱신되므로 동시에 두 재전송이 와도 하나만 1 을 돌려받는다.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE PolarWebhookDelivery d SET d.status = :processing, d.attempts = d.attempts + 1, "
            + "d.updatedAt = :now, d.errorMessage = null "
            + "WHERE d.id = :id AND d.attempts = :expectedAttempts")
    int reclaim(
            @Param("id") String id,
            @Param("expectedAttempts") int expectedAttempts,
            @Param("processing") PolarWebhookDeliveryStatus processing,
            @Param("now") LocalDateTime now);

    @Modifying
    @Query("DELETE FROM PolarWebhookDelivery d WHERE d.receivedAt < :before")
    int deleteReceivedBefore(@Param("before") LocalDateTime before);
}
