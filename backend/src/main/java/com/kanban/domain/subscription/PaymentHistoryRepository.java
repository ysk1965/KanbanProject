package com.kanban.domain.subscription;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentHistoryRepository extends JpaRepository<PaymentHistory, String> {

    Page<PaymentHistory> findBySubscriptionIdOrderByCreatedAtDesc(String subscriptionId, Pageable pageable);

    @Modifying
    @Query("DELETE FROM PaymentHistory ph WHERE ph.subscription.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
