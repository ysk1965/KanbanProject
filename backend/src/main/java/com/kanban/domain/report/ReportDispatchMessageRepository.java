package com.kanban.domain.report;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ReportDispatchMessageRepository extends JpaRepository<ReportDispatchMessage, String> {

    /** 보고서 삭제 시 회수할 대상(채널·ts) 조회 */
    List<ReportDispatchMessage> findByReportId(String reportId);

    /** 회수 후 이 보고서의 발송 기록 정리 */
    @Modifying
    @Query("DELETE FROM ReportDispatchMessage m WHERE m.reportId = :reportId")
    void deleteByReportId(@Param("reportId") String reportId);
}
