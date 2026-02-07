package com.kanban.domain.report.dto;

import com.kanban.domain.report.WeeklyReport;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.format.DateTimeFormatter;
import java.util.List;

public class ReportResponse {

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final DateTimeFormatter DATETIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'");

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String reportType;
        private String targetUserId;
        private String periodStart;
        private String periodEnd;
        private String content;
        private String generatedBy;
        private String generatedByName;
        private String createdAt;

        public static Detail from(WeeklyReport report) {
            return Detail.builder()
                    .id(report.getId())
                    .reportType(report.getReportType().name())
                    .targetUserId(report.getTargetUserId())
                    .periodStart(report.getPeriodStart().format(DATE_FORMATTER))
                    .periodEnd(report.getPeriodEnd().format(DATE_FORMATTER))
                    .content(report.getContent())
                    .generatedBy(report.getGeneratedBy().getId())
                    .generatedByName(report.getGeneratedBy().getName())
                    .createdAt(report.getCreatedAt().format(DATETIME_FORMATTER))
                    .build();
        }
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ListItem {
        private String id;
        private String reportType;
        private String periodStart;
        private String periodEnd;
        private String generatedByName;
        private String createdAt;

        public static ListItem from(WeeklyReport report) {
            return ListItem.builder()
                    .id(report.getId())
                    .reportType(report.getReportType().name())
                    .periodStart(report.getPeriodStart().format(DATE_FORMATTER))
                    .periodEnd(report.getPeriodEnd().format(DATE_FORMATTER))
                    .generatedByName(report.getGeneratedBy().getName())
                    .createdAt(report.getCreatedAt().format(DATETIME_FORMATTER))
                    .build();
        }
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ListResponse {
        private List<ListItem> reports;
    }
}
