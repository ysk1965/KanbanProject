package com.kanban.domain.subscription;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OrgPaymentHistoryRepository extends JpaRepository<OrgPaymentHistory, String> {
    List<OrgPaymentHistory> findByOrgSubscriptionIdOrderByCreatedAtDesc(String subId);
}
