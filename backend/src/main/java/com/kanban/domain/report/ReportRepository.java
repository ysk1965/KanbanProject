package com.kanban.domain.report;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ReportRepository extends JpaRepository<WeeklyReport, String> {

    List<WeeklyReport> findByBoardIdAndReportTypeOrderByCreatedAtDesc(
            String boardId, ReportType reportType);

    List<WeeklyReport> findByBoardIdAndReportTypeAndTargetUserIdOrderByCreatedAtDesc(
            String boardId, ReportType reportType, String targetUserId);

    List<WeeklyReport> findByBoardIdOrderByCreatedAtDesc(String boardId);

    Optional<WeeklyReport> findByBoardIdAndReportTypeAndPeriodStartAndPeriodEnd(
            String boardId, ReportType reportType, LocalDate periodStart, LocalDate periodEnd);

    Optional<WeeklyReport> findByBoardIdAndTargetUserIdAndReportTypeAndPeriodStartAndPeriodEnd(
            String boardId, String targetUserId, ReportType reportType,
            LocalDate periodStart, LocalDate periodEnd);

    @Query("SELECT COUNT(r) FROM WeeklyReport r WHERE r.board.id = :boardId " +
           "AND ((r.generatedBy.id = :userId AND r.createdAt >= :since) " +
           "OR (r.lastRegeneratedBy.id = :userId AND r.updatedAt >= :since AND r.updatedAt > r.createdAt))")
    long countAiCallsSince(@Param("boardId") String boardId,
                           @Param("userId") String userId,
                           @Param("since") LocalDateTime since);

    @Modifying
    @Query("DELETE FROM WeeklyReport r WHERE r.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
