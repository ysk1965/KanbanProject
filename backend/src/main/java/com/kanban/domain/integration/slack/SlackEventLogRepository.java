package com.kanban.domain.integration.slack;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface SlackEventLogRepository extends JpaRepository<SlackEventLog, String> {

    boolean existsByEventId(String eventId);

    @Modifying
    @Query("DELETE FROM SlackEventLog e WHERE e.processedAt < :cutoff")
    void deleteOlderThan(@Param("cutoff") LocalDateTime cutoff);
}
