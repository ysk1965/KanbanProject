package com.kanban.domain.report.controller;

import com.kanban.domain.report.dto.AutoReportResponse;
import com.kanban.domain.report.service.AutoReportQueryService;
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

    /** 자동 보고서 이력 — 과거 주차 되짚기 */
    @GetMapping("/api/v1/boards/{boardId}/reports/auto")
    public ResponseEntity<List<AutoReportResponse>> list(
            @PathVariable String boardId,
            @RequestParam(value = "limit", defaultValue = "20") int limit,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(queryService.listAuto(boardId, principal.getUserId(), limit));
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
}
