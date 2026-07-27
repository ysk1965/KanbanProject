package com.kanban.domain.report;

import com.kanban.domain.board.Board;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 자동 발송 시도 기록. 생성 실패·발송 실패·부분 실패가 조용히 묻히지 않게 남긴다.
 */
@Entity
@Table(
    name = "report_delivery_logs",
    indexes = {
        @Index(name = "idx_report_delivery_board", columnList = "board_id"),
        @Index(name = "idx_report_delivery_created", columnList = "created_at")
    }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ReportDeliveryLog {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    /** 생성 자체가 실패하면 보고서가 없으므로 null이 될 수 있다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "report_id")
    private WeeklyReport report;

    @Enumerated(EnumType.STRING)
    @Column(name = "report_type", nullable = false, length = 30)
    private ReportType reportType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ReportDeliveryStatus status;

    @Column(name = "slack_channel_id", length = 40)
    private String slackChannelId;

    /** 소스별 수집 결과 요약 (부분 실패 추적용) */
    @Column(name = "source_status_json", columnDefinition = "TEXT")
    private String sourceStatusJson;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "attempt_count", nullable = false)
    private Integer attemptCount = 1;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    @Builder
    public ReportDeliveryLog(Board board, WeeklyReport report, ReportType reportType,
                             ReportDeliveryStatus status, String slackChannelId,
                             String sourceStatusJson, String errorMessage, Integer attemptCount) {
        this.board = board;
        this.report = report;
        this.reportType = reportType;
        this.status = status;
        this.slackChannelId = slackChannelId;
        this.sourceStatusJson = sourceStatusJson;
        this.errorMessage = errorMessage;
        this.attemptCount = attemptCount != null ? attemptCount : 1;
    }

    /**
     * 발송이 끝나 RUNNING 행을 최종 상태로 갱신한다. 생성된 보고서·소스별 결과·실패 사유를 채운다.
     * ({@code report}는 별도 트랜잭션에서 이미 커밋된 프록시로 넘어온다.)
     */
    public void complete(WeeklyReport report, ReportDeliveryStatus status,
                         String sourceStatusJson, String errorMessage) {
        this.report = report;
        this.status = status;
        this.sourceStatusJson = sourceStatusJson;
        this.errorMessage = errorMessage;
    }
}
