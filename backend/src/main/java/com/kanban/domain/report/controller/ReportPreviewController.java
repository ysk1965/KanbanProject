package com.kanban.domain.report.controller;

import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.dto.AutoReportResponse;
import com.kanban.domain.report.dto.ReportConfigDto;
import com.kanban.domain.report.dto.ReportPreviewResponse;
import com.kanban.domain.report.service.ReportConfigService;
import com.kanban.domain.report.service.ReportSourcePreviewService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 자동 보고서 설정·미리보기·즉시 발송. 스케줄과 무관하게 손으로 돌려보는 창구.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/boards/{boardId}/reports")
public class ReportPreviewController {

    private final ReportSourcePreviewService previewService;
    private final ReportConfigService configService;

    @GetMapping("/config")
    public ResponseEntity<ReportConfigDto.Detail> getConfig(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(configService.get(boardId, principal.getUserId()));
    }

    @PutMapping("/config")
    public ResponseEntity<ReportConfigDto.Detail> updateConfig(
            @PathVariable String boardId,
            @RequestBody ReportConfigDto.Update request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(configService.update(boardId, principal.getUserId(), request));
    }

    /**
     * 스케줄을 기다리지 않고 지금 한 번 보낸다. 설정을 마친 뒤 확인용.
     * (미리보기와 달리 AI를 호출하고 실제로 슬랙에 게시한다)
     */
    @PostMapping("/dispatch")
    public ResponseEntity<Map<String, String>> dispatchNow(
            @PathVariable String boardId,
            @RequestParam(value = "type", defaultValue = "DAILY_DEV") String type,
            @AuthenticationPrincipal UserPrincipal principal) {
        String reportId = configService.dispatchNow(boardId, principal.getUserId(), parseType(type));
        return ResponseEntity.ok(Map.of("report_id", reportId));
    }

    /**
     * 소스 수집만 실행한다 (AI 미호출, 크레딧 미차감).
     *
     * @param type DAILY_DEV | WEEKLY_INTEGRATED
     */
    @PostMapping("/preview")
    public ResponseEntity<ReportPreviewResponse> preview(
            @PathVariable String boardId,
            @RequestParam(value = "type", defaultValue = "DAILY_DEV") String type,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                previewService.preview(boardId, principal.getUserId(), parseType(type)));
    }

    /**
     * 발송하지 않고 실제 보고서를 만들어 돌려준다 (AI 호출, 저장·슬랙 게시 없음).
     * 소스 수집 결과가 비어 있으면 AI를 태우지 않는다 — 본문 없는 응답으로 온다.
     *
     * @param type DAILY_DEV | WEEKLY_INTEGRATED
     */
    @PostMapping("/render-preview")
    public ResponseEntity<AutoReportResponse> renderPreview(
            @PathVariable String boardId,
            @RequestParam(value = "type", defaultValue = "DAILY_DEV") String type,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                configService.renderPreview(boardId, principal.getUserId(), parseType(type)));
    }

    private ReportType parseType(String type) {
        try {
            ReportType parsed = ReportType.valueOf(type.toUpperCase());
            if (parsed != ReportType.DAILY_DEV && parsed != ReportType.WEEKLY_INTEGRATED) {
                throw new IllegalArgumentException(type);
            }
            return parsed;
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE,
                    "type은 DAILY_DEV 또는 WEEKLY_INTEGRATED여야 합니다");
        }
    }
}
