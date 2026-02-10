package com.kanban.domain.report.controller;

import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.dto.ReportRequest;
import com.kanban.domain.report.dto.ReportResponse;
import com.kanban.domain.report.service.ReportService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/api/v1/boards/{boardId}/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    @PostMapping
    public ResponseEntity<ReportResponse.Detail> generateReport(
            @PathVariable String boardId,
            @RequestBody @Valid ReportRequest.Generate request,
            @AuthenticationPrincipal UserPrincipal principal) {
        log.info("Generate {} report for board: {}, user: {}",
                request.getReportType(), boardId, principal.getUserId());
        return ResponseEntity.ok(
                reportService.generateReport(boardId, principal.getUserId(), request));
    }

    @GetMapping
    public ResponseEntity<ReportResponse.ListResponse> getReports(
            @PathVariable String boardId,
            @RequestParam(required = false) ReportType report_type,
            @RequestParam(required = false) String target_user_id,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                reportService.getReports(boardId, principal.getUserId(), report_type, target_user_id));
    }

    @GetMapping("/{reportId}")
    public ResponseEntity<ReportResponse.Detail> getReport(
            @PathVariable String boardId,
            @PathVariable String reportId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                reportService.getReport(boardId, reportId, principal.getUserId()));
    }

    @PostMapping("/{reportId}/regenerate")
    public ResponseEntity<ReportResponse.Detail> regenerateReport(
            @PathVariable String boardId,
            @PathVariable String reportId,
            @RequestParam(required = false) String language,
            @AuthenticationPrincipal UserPrincipal principal) {
        log.info("Regenerate report {} for board: {}, user: {}, language: {}",
                reportId, boardId, principal.getUserId(), language);
        return ResponseEntity.ok(
                reportService.regenerateReport(boardId, reportId, principal.getUserId(), language));
    }
}
