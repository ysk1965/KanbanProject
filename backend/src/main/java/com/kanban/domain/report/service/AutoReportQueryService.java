package com.kanban.domain.report.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.report.ReportDeliveryLog;
import com.kanban.domain.report.ReportDeliveryLogRepository;
import com.kanban.domain.report.ReportDispatchMessage;
import com.kanban.domain.report.ReportDispatchMessageRepository;
import com.kanban.domain.report.ReportDeliveryStatus;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.WeeklyReport;
import com.kanban.domain.report.ReportRepository;
import com.kanban.domain.report.dto.AutoReportResponse;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.domain.report.dto.ReportDeliveryLogResponse;
import com.kanban.domain.storage.service.ReportFileFiler;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
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
    private final ReportDeliveryLogRepository deliveryLogRepository;
    private final ReportDispatchMessageRepository dispatchMessageRepository;
    private final ReportSlackPublisher slackPublisher;
    private final BoardService boardService;
    private final ReportFileFiler reportFileFiler;
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

    /**
     * 발송 이력 — 크론이 언제 돌아 성공·실패·건너뜀·진행 중 어느 상태로 끝났는지. 운영 정보라
     * <b>관리자 이상만</b> 볼 수 있다. 최근순 페이지네이션.
     */
    @Transactional(readOnly = true)
    public ReportDeliveryLogResponse.Page listDeliveryLogs(String boardId, String userId, int page, int size) {
        boardService.checkAdminOrAbove(boardId, userId);
        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, Math.min(size, 50));
        Pageable pageable = PageRequest.of(safePage, safeSize);
        Page<ReportDeliveryLog> result =
                deliveryLogRepository.findByBoardIdOrderByCreatedAtDesc(boardId, pageable);

        List<ReportDeliveryLogResponse> items = result.getContent().stream()
                .map(this::toLogResponse)
                .toList();
        boolean hasRunning = result.getContent().stream()
                .anyMatch(l -> l.getStatus() == ReportDeliveryStatus.RUNNING);

        return ReportDeliveryLogResponse.Page.builder()
                .items(items)
                .page(safePage)
                .size(safeSize)
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .hasNext(result.hasNext())
                .hasRunning(hasRunning)
                .build();
    }

    private ReportDeliveryLogResponse toLogResponse(ReportDeliveryLog log) {
        // report는 지연 로딩 프록시 — id만 읽으면 초기화 없이 얻는다. 실패·건너뜀·진행 중이면 null.
        String reportId = null;
        try {
            if (log.getReport() != null) {
                reportId = log.getReport().getId();
            }
        } catch (Exception ignored) {
            // 참조가 끊긴(삭제된 보고서) 경우 — id 없이 이력만 보여 준다.
        }
        return ReportDeliveryLogResponse.builder()
                .id(log.getId())
                .reportId(reportId)
                .reportType(log.getReportType().name())
                .status(log.getStatus().name())
                .errorMessage(log.getErrorMessage())
                .slackChannelId(log.getSlackChannelId())
                .attemptCount(log.getAttemptCount())
                .createdAt(log.getCreatedAt() != null ? log.getCreatedAt().toString() : null)
                .sourceStatus(parseSourceStatus(log.getSourceStatusJson()))
                .build();
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

    /**
     * 보관된 보고서 삭제 — 관리자 이상만 가능.
     * 발송 로그(감사 기록)는 참조만 끊어 남기고 보고서 본문을 지운다.
     */
    @Transactional
    public void deleteReport(String boardId, String reportId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        WeeklyReport report = reportRepository.findById(reportId)
                .orElseThrow(() -> new BusinessException(ErrorCode.AI_REPORT_NOT_FOUND));
        if (!report.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.AI_REPORT_NOT_FOUND);
        }
        // 슬랙에 게시됐던 메시지를 먼저 회수한다 — detach/삭제로 발송 기록을 잃기 전에.
        // 회수 실패(이미 지워짐·권한·토큰 등)가 보고서 삭제를 막지 않도록 best-effort.
        try {
            List<ReportDispatchMessage> dispatched = dispatchMessageRepository.findByReportId(reportId);
            if (!dispatched.isEmpty()) {
                List<ReportSlackPublisher.Recallable> recallables = dispatched.stream()
                        .map(m -> new ReportSlackPublisher.Recallable(m.getChannelId(), m.getMessageTs()))
                        .toList();
                slackPublisher.recall(report.getBoard(), recallables);
                dispatchMessageRepository.deleteByReportId(reportId);
            }
        } catch (Exception e) {
            log.warn("슬랙 메시지 회수 실패 board={} report={}: {}", boardId, reportId, e.getMessage());
        }

        // 이 보고서가 수집한 이미지/썸네일 폴더도 함께 휴지통으로. 자료실 휴지통에서 되살릴 수 있고,
        // S3 객체는 남아 같은 이미지를 쓰는 다른 회차 보고서 본문은 깨지지 않는다. best-effort.
        try {
            reportFileFiler.discardReportFolder(boardId, reportId);
        } catch (Exception e) {
            log.warn("보고서 자료 폴더 정리 실패 board={} report={}: {}", boardId, reportId, e.getMessage());
        }
        deliveryLogRepository.detachReport(reportId);
        reportRepository.delete(report);
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
