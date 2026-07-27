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

    List<WeeklyReport> findByBoardIdAndReportTypeAndTargetUserIdOrderByCreatedAtDesc(
            String boardId, ReportType reportType, String targetUserId);

    List<WeeklyReport> findByBoardIdOrderByCreatedAtDesc(String boardId);

    /** 공유 링크 조회 — 로그인 없이 들어오는 경로라 토큰이 유일한 열쇠다. */
    Optional<WeeklyReport> findByShareToken(String shareToken);

    Optional<WeeklyReport> findByBoardIdAndReportTypeAndPeriodStartAndPeriodEnd(
            String boardId, ReportType reportType, LocalDate periodStart, LocalDate periodEnd);

    /**
     * 주간 롤업용 — 그 주에 발행된 일일 보고서를 시작일(=수집 구간 시작일)로 훑는다.
     * 같은 날 재생성본이 여러 개면 최신이 먼저 오도록 정렬해, 호출부가 하루당 한 벌만 집는다.
     */
    @Query("SELECT r FROM WeeklyReport r WHERE r.board.id = :boardId "
            + "AND r.reportType = com.kanban.domain.report.ReportType.DAILY_DEV "
            + "AND r.periodStart >= :from AND r.periodStart <= :to "
            + "ORDER BY r.periodStart DESC, r.createdAt DESC")
    List<WeeklyReport> findDailyReportsForRollup(
            @Param("boardId") String boardId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    /**
     * 직전 일일 보고서 — "전일 대비 새로 등장한 기능"을 가리는 데 쓴다. 같은 날 재생성본이 여러 개면
     * 최신이 앞에 오고, 호출부가 첫 건만 집는다.
     */
    @Query("SELECT r FROM WeeklyReport r WHERE r.board.id = :boardId "
            + "AND r.reportType = com.kanban.domain.report.ReportType.DAILY_DEV "
            + "AND r.periodStart < :before "
            + "ORDER BY r.periodStart DESC, r.createdAt DESC")
    List<WeeklyReport> findPreviousDailyReports(
            @Param("boardId") String boardId,
            @Param("before") LocalDate before,
            org.springframework.data.domain.Pageable pageable);

    Optional<WeeklyReport> findByBoardIdAndTargetUserIdAndReportTypeAndPeriodStartAndPeriodEnd(
            String boardId, String targetUserId, ReportType reportType,
            LocalDate periodStart, LocalDate periodEnd);

    @Modifying
    @Query("DELETE FROM WeeklyReport r WHERE r.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
