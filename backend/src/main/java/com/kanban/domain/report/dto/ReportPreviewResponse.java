package com.kanban.domain.report.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * 미리보기 결과. "커밋 38건 · 페이지 1건"을 보여주고, 0건이면 설정이 틀렸다는 걸 저장 전에 알린다.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReportPreviewResponse {

    private String reportType;
    private String periodStart;
    private String periodEnd;
    private String periodLabel;
    private String timezone;
    private List<SourceResult> sources;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SourceResult {
        /** GITHUB | KANBAN | CONFLUENCE */
        private String kind;
        /** 연결과 대상 선택이 모두 끝났는가 */
        private boolean configured;
        private boolean success;
        /** 구간 안에 실제로 모인 내용이 있는가 (연결은 됐지만 0건일 수 있다) */
        private boolean hasData;
        private String summary;
        private String errorMessage;
        private Map<String, Object> metrics;
    }
}
