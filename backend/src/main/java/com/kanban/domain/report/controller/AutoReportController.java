package com.kanban.domain.report.controller;

import com.kanban.domain.report.dto.AutoReportResponse;
import com.kanban.domain.report.dto.ReportDeliveryLogResponse;
import com.kanban.domain.report.service.AutoReportQueryService;
import com.kanban.domain.report.service.ReportFileBackfillService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 자동 보고서 페이지 조회.
 *
 * <p>두 경로가 같은 보고서를 연다 — 보드 멤버용과 슬랙 버튼이 가리키는 공유 링크용.
 */
@RestController
@RequiredArgsConstructor
public class AutoReportController {

    private final AutoReportQueryService queryService;
    private final ReportFileBackfillService backfillService;

    /** 자동 보고서 이력 — 과거 주차 되짚기 */
    @GetMapping("/api/v1/boards/{boardId}/reports/auto")
    public ResponseEntity<List<AutoReportResponse>> list(
            @PathVariable String boardId,
            @RequestParam(value = "limit", defaultValue = "20") int limit,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(queryService.listAuto(boardId, principal.getUserId(), limit));
    }

    /** 발송 이력 — 크론 실행/실패/진행 상황. 운영 정보라 관리자 이상만. 최근순 페이지네이션. */
    @GetMapping("/api/v1/boards/{boardId}/reports/auto/delivery-logs")
    public ResponseEntity<ReportDeliveryLogResponse.Page> deliveryLogs(
            @PathVariable String boardId,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "5") int size,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(queryService.listDeliveryLogs(boardId, principal.getUserId(), page, size));
    }

    @GetMapping("/api/v1/boards/{boardId}/reports/auto/{reportId}")
    public ResponseEntity<AutoReportResponse> getForMember(
            @PathVariable String boardId,
            @PathVariable String reportId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(queryService.getForMember(boardId, reportId, principal.getUserId()));
    }

    /**
     * 공유 링크. 인증 없이 열리므로 검색엔진에 색인되지 않도록 헤더를 붙인다.
     */
    @GetMapping("/api/v1/reports/share/{shareToken}")
    public ResponseEntity<AutoReportResponse> getByShareToken(@PathVariable String shareToken) {
        return ResponseEntity.ok()
                .header("X-Robots-Tag", "noindex, nofollow")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(queryService.getByShareToken(shareToken));
    }

    /** 공유 링크 무효화 */
    @DeleteMapping("/api/v1/boards/{boardId}/reports/auto/{reportId}/share")
    public ResponseEntity<Void> revokeShareLink(
            @PathVariable String boardId,
            @PathVariable String reportId,
            @AuthenticationPrincipal UserPrincipal principal) {
        queryService.revokeShareLink(boardId, reportId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    /** 보관된 보고서 삭제 — 관리자 이상만 */
    @DeleteMapping("/api/v1/boards/{boardId}/reports/auto/{reportId}")
    public ResponseEntity<Void> deleteReport(
            @PathVariable String boardId,
            @PathVariable String reportId,
            @AuthenticationPrincipal UserPrincipal principal) {
        queryService.deleteReport(boardId, reportId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }

    /**
     * 폴더화 이전에 자료실 루트에 쌓인 수집 파일을 보고서 폴더로 정리한다 — 관리자 이상, 1회성.
     * {@code dry_run=true}(기본)면 옮기지 않고 건수만 돌려준다.
     */
    @PostMapping("/api/v1/boards/{boardId}/reports/auto/organize-files")
    public ResponseEntity<ReportFileBackfillService.Result> organizeFiles(
            @PathVariable String boardId,
            @RequestParam(value = "dry_run", defaultValue = "true") boolean dryRun,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(backfillService.organize(boardId, principal.getUserId(), dryRun));
    }
}
