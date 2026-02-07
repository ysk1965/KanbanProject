package com.kanban.domain.report.dto;

import com.kanban.domain.report.ReportType;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

public class ReportRequest {

    @Data
    public static class Generate {
        @NotNull
        private ReportType reportType;

        @NotNull
        private LocalDate periodStart;

        @NotNull
        private LocalDate periodEnd;

        private String language;

        private String targetUserId;
    }
}
