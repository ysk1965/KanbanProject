package com.kanban.domain.report.dto;

import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.WeeklyReport;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.report.source.SourceChunk;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 보고서 페이지가 그리는 데 필요한 전부. 공유 링크와 보드 내부 조회가 같은 형태를 쓴다.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AutoReportResponse {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ISO_LOCAL_DATE;

    private String id;
    private String boardId;
    private String boardName;
    private String reportType;
    private String periodStart;
    private String periodEnd;
    private String createdAt;

    /** 구조화 본문 — 지표 카드·섹션·리스크가 여기 있다 */
    private ReportContent content;

    /** 마크다운 본문 (구조화 파싱이 실패했거나 수동 생성 보고서일 때의 대비책) */
    private String markdown;

    /** 소스별 수집 성공/실패 — 페이지에서 "GitHub 수집 실패" 배지로 쓴다 */
    private List<SourceStatus> sourceStatus;

    /** 커밋 목록 등 수집 원본. 페이지 하단의 상세 표에 쓴다. */
    private String rawData;

    /** 공유 링크가 살아 있는지 (목록에서만 쓴다) */
    private boolean shared;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SourceStatus {
        private String source;
        private boolean success;
        private boolean hasData;
        private String summary;
        private String error;
    }

    /**
     * 저장되지 않은 렌더링 미리보기. 실제 보고서 페이지와 <b>같은 형태</b>로 내려
     * 프론트가 발행본과 동일한 렌더러를 재사용하게 한다. id·createdAt은 없다(저장 전이므로).
     */
    public static AutoReportResponse preview(String boardId, String boardName, ReportType reportType,
                                             ReportPeriod period, ReportContent content,
                                             List<SourceChunk> chunks, String rawData) {
        return AutoReportResponse.builder()
                .boardId(boardId)
                .boardName(boardName)
                .reportType(reportType.name())
                .periodStart(period.startDate().format(DATE))
                .periodEnd(period.endDate().format(DATE))
                .content(content)
                .rawData(rawData)
                .sourceStatus(chunks.stream()
                        .map(c -> SourceStatus.builder()
                                .source(c.kind().name())
                                .success(c.success())
                                .hasData(c.hasData())
                                .summary(c.summary())
                                .error(c.errorMessage())
                                .build())
                        .toList())
                .shared(false)
                .build();
    }

    public static AutoReportResponse.AutoReportResponseBuilder base(WeeklyReport report) {
        return AutoReportResponse.builder()
                .id(report.getId())
                .boardId(report.getBoard().getId())
                .boardName(report.getBoard().getName())
                .reportType(report.getReportType().name())
                .periodStart(report.getPeriodStart().format(DATE))
                .periodEnd(report.getPeriodEnd().format(DATE))
                .createdAt(report.getCreatedAt() != null ? report.getCreatedAt().toString() : null)
                .markdown(report.getContent())
                .rawData(report.getDataSnapshot());
    }
}
