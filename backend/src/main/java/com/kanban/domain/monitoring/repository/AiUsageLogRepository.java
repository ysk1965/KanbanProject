package com.kanban.domain.monitoring.repository;

import com.kanban.domain.monitoring.entity.AiUsageLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface AiUsageLogRepository extends JpaRepository<AiUsageLog, String> {

    List<AiUsageLog> findByCreatedAtAfter(LocalDateTime since);

    @Query("SELECT a.boardId, SUM(a.inputTokens), SUM(a.outputTokens), SUM(a.estimatedCostUsd), COUNT(a) " +
            "FROM AiUsageLog a WHERE a.createdAt >= :since AND a.boardId IS NOT NULL " +
            "GROUP BY a.boardId ORDER BY SUM(a.inputTokens) + SUM(a.outputTokens) DESC")
    List<Object[]> findUsageByBoardSince(@Param("since") LocalDateTime since);

    @Query("SELECT a.featureType, SUM(a.inputTokens), SUM(a.outputTokens), SUM(a.estimatedCostUsd), COUNT(a) " +
            "FROM AiUsageLog a WHERE a.createdAt >= :since " +
            "GROUP BY a.featureType ORDER BY COUNT(a) DESC")
    List<Object[]> findUsageByFeatureTypeSince(@Param("since") LocalDateTime since);

    @Query("SELECT CAST(a.createdAt AS date), SUM(a.inputTokens), SUM(a.outputTokens), SUM(a.estimatedCostUsd), COUNT(a) " +
            "FROM AiUsageLog a WHERE a.createdAt >= :since " +
            "GROUP BY CAST(a.createdAt AS date) ORDER BY CAST(a.createdAt AS date) ASC")
    List<Object[]> findDailyTrendSince(@Param("since") LocalDateTime since);

    @Modifying
    @Query("DELETE FROM AiUsageLog a WHERE a.createdAt < :before")
    int deleteOlderThan(@Param("before") LocalDateTime before);
}
