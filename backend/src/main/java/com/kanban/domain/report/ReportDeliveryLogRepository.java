package com.kanban.domain.report;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface ReportDeliveryLogRepository extends JpaRepository<ReportDeliveryLog, String> {

    List<ReportDeliveryLog> findByBoardIdOrderByCreatedAtDesc(String boardId);

    List<ReportDeliveryLog> findByBoardIdAndReportTypeAndCreatedAtAfter(
            String boardId, ReportType reportType, LocalDateTime after);
}
