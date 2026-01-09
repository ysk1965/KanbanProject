package com.kanban.domain.subscription;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentHistoryRepository extends JpaRepository<PaymentHistory, String> {

    Page<PaymentHistory> findBySubscriptionIdOrderByCreatedAtDesc(String subscriptionId, Pageable pageable);
}
