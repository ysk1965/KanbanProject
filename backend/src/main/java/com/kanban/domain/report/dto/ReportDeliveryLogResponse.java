package com.kanban.domain.report.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * 발송 이력 한 줄. 크론이 언제 돌아 어떤 상태로 끝났는지(또는 지금 돌고 있는지)와
 * 실패 사유·소스별 수집 결과를 담아, 보고서 탭 '발송 이력' 드롭다운이 그린다.
 */
@Data
@Builder
public class ReportDeliveryLogResponse {

    private String id;

    /** 발송에 성공해 저장된 보고서 id. 생성 전 실패·건너뜀·진행 중이면 null. */
    private String reportId;

    /** DAILY_DEV / WEEKLY_INTEGRATED */
    private String reportType;

    /** RUNNING / SUCCESS / PARTIAL / FAILED / SKIPPED */
    private String status;

    /** 실패·건너뜀 사유 (성공이면 null) */
    private String errorMessage;

    private String slackChannelId;

    private Integer attemptCount;

    /** 발송 시작 시각 (UTC ISO) */
    private String createdAt;

    /** 소스별 수집 성공/실패 — 부분 실패를 소스 단위로 짚어 준다 */
    private List<AutoReportResponse.SourceStatus> sourceStatus;

    /** 페이지 응답 봉투 — 프론트 페이저(총 건수·페이지 수·다음 여부)에 필요한 것만 담는다. */
    @Data
    @Builder
    public static class Page {
        private List<ReportDeliveryLogResponse> items;
        private int page;
        private int size;
        private long totalElements;
        private int totalPages;
        private boolean hasNext;
        /** 진행 중(RUNNING) 항목이 하나라도 있으면 true — 프론트가 폴링을 이어 갈지 판단한다 */
        private boolean hasRunning;
    }
}
