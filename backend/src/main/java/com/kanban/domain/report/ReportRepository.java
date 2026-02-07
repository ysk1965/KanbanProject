package com.kanban.domain.report;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ReportRepository extends JpaRepository<WeeklyReport, String> {

    List<WeeklyReport> findByBoardIdAndReportTypeOrderByCreatedAtDesc(
            String boardId, ReportType reportType);

    List<WeeklyReport> findByBoardIdOrderByCreatedAtDesc(String boardId);

    Optional<WeeklyReport> findByBoardIdAndReportTypeAndPeriodStartAndPeriodEnd(
            String boardId, ReportType reportType, LocalDate periodStart, LocalDate periodEnd);

    Optional<WeeklyReport> findByBoardIdAndTargetUserIdAndReportTypeAndPeriodStartAndPeriodEnd(
            String boardId, String targetUserId, ReportType reportType,
            LocalDate periodStart, LocalDate periodEnd);

    @Modifying
    @Query("DELETE FROM WeeklyReport r WHERE r.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
