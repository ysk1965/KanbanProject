package com.kanban.domain.subscription;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface SubscriptionRepository extends JpaRepository<Subscription, String> {

    Optional<Subscription> findByBoardId(String boardId);

    @Query("SELECT s FROM Subscription s WHERE s.status = 'TRIAL' AND s.trialEndsAt < :now")
    List<Subscription> findExpiredTrials(@Param("now") LocalDateTime now);

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

    @Modifying
    @Query("DELETE FROM Subscription s WHERE s.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    // Analytics: 전환율 통계
    long countByStatusIn(java.util.Collection<SubscriptionStatus> statuses);

    @Query("SELECT COUNT(s) FROM Subscription s WHERE s.status = 'TRIAL' AND s.trialEndsAt < :now")
    long countTrialExpiredNotConverted(@Param("now") LocalDateTime now);

    // 월별 구독 생성 추이 (전체 Trial 시작) - PostgreSQL TO_CHAR
    @Query(value = "SELECT TO_CHAR(created_at, 'YYYY-MM') as m, COUNT(*) as cnt " +
            "FROM subscriptions WHERE created_at >= :startDate " +
            "GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY m",
            nativeQuery = true)
    List<Object[]> getMonthlyTrialStarted(@Param("startDate") LocalDateTime startDate);

    // 월별 전환 추이 (ACTIVE 전환)
    @Query(value = "SELECT TO_CHAR(current_period_start, 'YYYY-MM') as m, COUNT(*) as cnt " +
            "FROM subscriptions WHERE status = 'ACTIVE' AND current_period_start >= :startDate " +
            "GROUP BY TO_CHAR(current_period_start, 'YYYY-MM') ORDER BY m",
            nativeQuery = true)
    List<Object[]> getMonthlyConverted(@Param("startDate") LocalDateTime startDate);

    // AI Credits

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM Subscription s WHERE s.board.id = :boardId")
    Optional<Subscription> findByBoardIdForUpdate(@Param("boardId") String boardId);

    @Query("SELECT s FROM Subscription s WHERE s.creditsResetDate IS NOT NULL AND s.creditsResetDate <= :now")
    List<Subscription> findDueForCreditReset(@Param("now") LocalDateTime now);

    @Query("SELECT s FROM Subscription s JOIN FETCH s.board WHERE s.cancelRequestedAt IS NOT NULL AND s.currentPeriodEnd < :now AND s.status = 'ACTIVE'")
    List<Subscription> findPendingCancellations(@Param("now") LocalDateTime now);

    @Query("SELECT s FROM Subscription s JOIN FETCH s.board WHERE s.status = 'PAST_DUE' AND s.pastDueSince < :threshold")
    List<Subscription> findByStatusPastDueAndPastDueSinceBefore(@Param("threshold") LocalDateTime threshold);
}
