package com.kanban.domain.subscription;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface SubscriptionRepository extends JpaRepository<Subscription, String> {

    Optional<Subscription> findByBoardId(String boardId);

    @Query("SELECT s FROM Subscription s WHERE s.status = 'TRIAL' AND s.trialEndsAt < :now")
    List<Subscription> findExpiredTrials(@Param("now") LocalDateTime now);

    @Query("SELECT s FROM Subscription s WHERE s.status = 'GRACE' AND s.graceEndsAt < :now")
    List<Subscription> findExpiredGracePeriods(@Param("now") LocalDateTime now);

    @Query("SELECT s FROM Subscription s WHERE s.status = 'ACTIVE' AND s.nextPaymentAt < :now")
    List<Subscription> findDueForPayment(@Param("now") LocalDateTime now);

    // Admin용 메서드
    @Query("SELECT s FROM Subscription s JOIN FETCH s.board b JOIN FETCH b.owner")
    Page<Subscription> findAllWithBoardAndOwner(Pageable pageable);

    long countByStatus(SubscriptionStatus status);

    /**
     * 여러 보드의 구독 정보 일괄 조회 (N+1 방지)
     */
    @Query("SELECT s FROM Subscription s WHERE s.board.id IN :boardIds")
    List<Subscription> findByBoardIdIn(@Param("boardIds") List<String> boardIds);
}
