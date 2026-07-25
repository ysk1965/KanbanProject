package com.kanban.domain.report;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface ReportDeliveryLogRepository extends JpaRepository<ReportDeliveryLog, String> {

    List<ReportDeliveryLog> findByBoardIdOrderByCreatedAtDesc(String boardId);

    List<ReportDeliveryLog> findByBoardIdAndReportTypeAndCreatedAtAfter(
            String boardId, ReportType reportType, LocalDateTime after);

    /**
     * 보고서를 삭제하기 전에 발송 로그의 참조만 끊는다.
     * 감사 기록 자체는 남겨 두되 FK 위반을 피한다.
     */
    @Modifying
    @Query("UPDATE ReportDeliveryLog l SET l.report = null WHERE l.report.id = :reportId")
    void detachReport(@Param("reportId") String reportId);
}
