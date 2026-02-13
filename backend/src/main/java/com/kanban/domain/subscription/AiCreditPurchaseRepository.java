package com.kanban.domain.subscription;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface AiCreditPurchaseRepository extends JpaRepository<AiCreditPurchase, String> {

    List<AiCreditPurchase> findByBoardIdOrderByCreatedAtDesc(String boardId);

    List<AiCreditPurchase> findByBoardIdAndCreatedAtAfterOrderByCreatedAtDesc(String boardId, LocalDateTime after);
}
