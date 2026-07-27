package com.kanban.domain.report;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface ReportDeliveryLogRepository extends JpaRepository<ReportDeliveryLog, String> {

    List<ReportDeliveryLog> findByBoardIdOrderByCreatedAtDesc(String boardId);

    /** 발송 이력 화면 — 최근순 페이지네이션 */
    Page<ReportDeliveryLog> findByBoardIdOrderByCreatedAtDesc(String boardId, Pageable pageable);

    List<ReportDeliveryLog> findByBoardIdAndReportTypeAndCreatedAtAfter(
            String boardId, ReportType reportType, LocalDateTime after);

    /**
     * 보고서를 삭제하기 전에 발송 로그의 참조만 끊는다.
     * 감사 기록 자체는 남겨 두되 FK 위반을 피한다.
     */
    @Modifying
    @Query("UPDATE ReportDeliveryLog l SET l.report = null WHERE l.report.id = :reportId")
    void detachReport(@Param("reportId") String reportId);

    /**
     * 프로세스가 죽어 RUNNING인 채로 방치된 오래된 행을 FAILED로 정리한다.
     * 스피너가 영원히 돌지 않게 하는 안전장치.
     */
    @Modifying
    @Query("UPDATE ReportDeliveryLog l SET l.status = com.kanban.domain.report.ReportDeliveryStatus.FAILED, "
            + "l.errorMessage = '발송이 완료되지 않았습니다 (타임아웃)' "
            + "WHERE l.status = com.kanban.domain.report.ReportDeliveryStatus.RUNNING AND l.createdAt < :threshold")
    int failStaleRunning(@Param("threshold") LocalDateTime threshold);
}
