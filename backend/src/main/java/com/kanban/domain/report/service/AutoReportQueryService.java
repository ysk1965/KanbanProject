package com.kanban.domain.report.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.WeeklyReport;
import com.kanban.domain.report.ReportRepository;
import com.kanban.domain.report.dto.AutoReportResponse;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

/**
 * 보고서 페이지 조회. 같은 보고서를 두 경로로 연다 —
 * 보드 멤버용(권한 확인)과 슬랙 버튼이 가리키는 공유 토큰용(토큰 확인).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AutoReportQueryService {

    private final ReportRepository reportRepository;
    private final BoardService boardService;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public AutoReportResponse getForMember(String boardId, String reportId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        WeeklyReport report = reportRepository.findById(reportId)
                .orElseThrow(() -> new BusinessException(ErrorCode.AI_REPORT_NOT_FOUND));
        if (!report.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.AI_REPORT_NOT_FOUND);
        }
        return toResponse(report);
    }

    /**
     * 공유 토큰으로 연다. 로그인이 없으므로 <b>토큰 유효성이 유일한 방어선</b>이다 —
     * 무효화됐거나 만료됐으면 404로 막는다.
     */
    @Transactional(readOnly = true)
    public AutoReportResponse getByShareToken(String shareToken) {
        WeeklyReport report = reportRepository.findByShareToken(shareToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.AI_REPORT_NOT_FOUND));
        if (!report.isShareLinkValid(LocalDateTime.now(ZoneOffset.UTC))) {
            throw new BusinessException(ErrorCode.REPORT_SHARE_LINK_EXPIRED);
        }
        return toResponse(report);
    }

    /**
     * 자동 생성된 보고서 이력. 과거 주차를 되짚어 보기 위한 목록이라
     * 본문 없이 기간·종류·공유 여부만 내려준다.
     */
    @Transactional(readOnly = true)
    public List<AutoReportResponse> listAuto(String boardId, String userId, int limit) {
        boardService.checkViewerOrAbove(boardId, userId);
        return reportRepository.findByBoardIdOrderByCreatedAtDesc(boardId).stream()
                .filter(r -> r.getReportType() == ReportType.DAILY_DEV
                        || r.getReportType() == ReportType.WEEKLY_INTEGRATED)
                .limit(Math.max(1, Math.min(limit, 100)))
                .map(r -> AutoReportResponse.base(r)
                        .sourceStatus(parseSourceStatus(r.getSourceStatusJson()))
                        // 목록에서는 본문·원본을 실어 보내지 않는다 — 수십 KB가 곱해진다.
                        .markdown(null)
                        .rawData(null)
                        .shared(r.getShareToken() != null)
                        .build())
                .toList();
    }

    /** 공유 링크 무효화 — 유출됐을 때 즉시 막는 수단 */
    @Transactional
    public void revokeShareLink(String boardId, String reportId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        WeeklyReport report = reportRepository.findById(reportId)
                .orElseThrow(() -> new BusinessException(ErrorCode.AI_REPORT_NOT_FOUND));
        if (!report.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.AI_REPORT_NOT_FOUND);
        }
        report.revokeShareLink();
    }

    private AutoReportResponse toResponse(WeeklyReport report) {
        return AutoReportResponse.base(report)
                .content(parseContent(report.getContentJson()))
                .sourceStatus(parseSourceStatus(report.getSourceStatusJson()))
                .build();
    }

    private ReportContent parseContent(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            int start = json.indexOf('{');
            int end = json.lastIndexOf('}');
            if (start < 0 || end <= start) {
                return null;
            }
            return objectMapper.readValue(json.substring(start, end + 1), ReportContent.class);
        } catch (Exception e) {
            log.warn("보고서 본문 파싱 실패 — 마크다운으로 대체됩니다: {}", e.getMessage());
            return null;
        }
    }

    private List<AutoReportResponse.SourceStatus> parseSourceStatus(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            List<Map<String, Object>> raw = objectMapper.readValue(json, new TypeReference<>() {});
            return raw.stream()
                    .map(m -> AutoReportResponse.SourceStatus.builder()
                            .source(String.valueOf(m.get("source")))
                            .success(Boolean.TRUE.equals(m.get("success")))
                            .hasData(Boolean.TRUE.equals(m.get("has_data")))
                            .summary(m.get("summary") != null ? String.valueOf(m.get("summary")) : null)
                            .error(m.get("error") != null ? String.valueOf(m.get("error")) : null)
                            .build())
                    .toList();
        } catch (Exception e) {
            return List.of();
        }
    }
}
