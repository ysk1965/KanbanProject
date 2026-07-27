package com.kanban.domain.system;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AiKeyAuditLogRepository extends JpaRepository<AiKeyAuditLog, String> {

    Page<AiKeyAuditLog> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
