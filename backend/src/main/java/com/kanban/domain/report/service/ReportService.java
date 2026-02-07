package com.kanban.domain.report.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.report.ReportRepository;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.WeeklyReport;
import com.kanban.domain.report.dto.ReportRequest;
import com.kanban.domain.report.dto.ReportResponse;
import com.kanban.domain.statistics.dto.ManagementResponse;
import com.kanban.domain.statistics.dto.StatisticsResponse;
import com.kanban.domain.statistics.service.ManagementService;
import com.kanban.domain.statistics.service.StatisticsService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReportService {

    private final ReportRepository reportRepository;
    private final BoardRepository boardRepository;
    private final BoardService boardService;
    private final UserRepository userRepository;
    private final StatisticsService statisticsService;
    private final ManagementService managementService;
    private final CommentRepository commentRepository;
    private final ReportAIService reportAIService;
    private final ObjectMapper objectMapper;

    private static final int MAX_COMMENTS = 100;
    private static final int MAX_COMMENT_LENGTH = 200;

    @Transactional
    public ReportResponse.Detail generateReport(String boardId, String userId, ReportRequest.Generate request) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        if (!board.isPremium()) {
            throw new BusinessException(ErrorCode.PREMIUM_FEATURE_REQUIRED);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        ReportType reportType = request.getReportType();

        if (reportType == ReportType.TEAM) {
            boardService.checkAdminOrAbove(boardId, userId);
        } else {
            boardService.checkMemberOrAbove(boardId, userId);
        }

        // Check for existing report
        Optional<WeeklyReport> existing = findExistingReport(
                boardId, userId, reportType, request.getPeriodStart(), request.getPeriodEnd());
        if (existing.isPresent()) {
            return ReportResponse.Detail.from(existing.get());
        }

        // Gather data and generate
        String dataJson = gatherData(boardId, userId, reportType,
                request.getPeriodStart(), request.getPeriodEnd(), board.getName());

        String content = reportAIService.generateReport(reportType, dataJson, request.getLanguage());

        WeeklyReport report = WeeklyReport.builder()
                .board(board)
                .generatedBy(user)
                .reportType(reportType)
                .targetUserId(reportType == ReportType.PERSONAL ? userId : null)
                .periodStart(request.getPeriodStart())
                .periodEnd(request.getPeriodEnd())
                .content(content)
                .dataSnapshot(dataJson)
                .build();

        reportRepository.save(report);
        log.info("Generated {} report for board: {}, user: {}", reportType, boardId, userId);

        return ReportResponse.Detail.from(report);
    }

    public ReportResponse.ListResponse getReports(String boardId, String userId, ReportType reportType) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<WeeklyReport> reports;
        if (reportType != null) {
            reports = reportRepository.findByBoardIdAndReportTypeOrderByCreatedAtDesc(boardId, reportType);
        } else {
            reports = reportRepository.findByBoardIdOrderByCreatedAtDesc(boardId);
        }

        List<ReportResponse.ListItem> items = reports.stream()
                .map(ReportResponse.ListItem::from)
                .collect(Collectors.toList());

        return ReportResponse.ListResponse.builder().reports(items).build();
    }

    public ReportResponse.Detail getReport(String boardId, String reportId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        WeeklyReport report = reportRepository.findById(reportId)
                .orElseThrow(() -> new BusinessException(ErrorCode.AI_REPORT_NOT_FOUND));

        if (!report.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        return ReportResponse.Detail.from(report);
    }

    @Transactional
    public ReportResponse.Detail regenerateReport(String boardId, String reportId, String userId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        if (!board.isPremium()) {
            throw new BusinessException(ErrorCode.PREMIUM_FEATURE_REQUIRED);
        }

        WeeklyReport report = reportRepository.findById(reportId)
                .orElseThrow(() -> new BusinessException(ErrorCode.AI_REPORT_NOT_FOUND));

        if (!report.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        ReportType reportType = report.getReportType();
        if (reportType == ReportType.TEAM) {
            boardService.checkAdminOrAbove(boardId, userId);
        } else {
            boardService.checkMemberOrAbove(boardId, userId);
        }

        String dataJson = gatherData(boardId, userId, reportType,
                report.getPeriodStart(), report.getPeriodEnd(), board.getName());

        String content = reportAIService.generateReport(reportType, dataJson, null);
        report.updateContent(content, dataJson);

        log.info("Regenerated {} report {} for board: {}", reportType, reportId, boardId);
        return ReportResponse.Detail.from(report);
    }

    private Optional<WeeklyReport> findExistingReport(String boardId, String userId,
                                                       ReportType reportType,
                                                       LocalDate periodStart, LocalDate periodEnd) {
        if (reportType == ReportType.PERSONAL) {
            return reportRepository.findByBoardIdAndTargetUserIdAndReportTypeAndPeriodStartAndPeriodEnd(
                    boardId, userId, reportType, periodStart, periodEnd);
        }
        return reportRepository.findByBoardIdAndReportTypeAndPeriodStartAndPeriodEnd(
                boardId, reportType, periodStart, periodEnd);
    }

    private String gatherData(String boardId, String userId, ReportType reportType,
                              LocalDate periodStart, LocalDate periodEnd, String boardName) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("board_name", boardName);
        data.put("period", Map.of("start", periodStart.toString(), "end", periodEnd.toString()));

        LocalDateTime startDT = periodStart.atStartOfDay();
        LocalDateTime endDT = periodEnd.plusDays(1).atStartOfDay();

        if (reportType == ReportType.TEAM) {
            gatherTeamData(data, boardId, userId, periodStart, periodEnd, startDT, endDT);
        } else {
            gatherPersonalData(data, boardId, userId, periodStart, periodEnd, startDT, endDT);
        }

        try {
            return objectMapper.writeValueAsString(data);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize report data: {}", e.getMessage());
            throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED);
        }
    }

    private void gatherTeamData(Map<String, Object> data, String boardId, String userId,
                                LocalDate periodStart, LocalDate periodEnd,
                                LocalDateTime startDT, LocalDateTime endDT) {
        // Board statistics
        StatisticsResponse.BoardStatistics stats = statisticsService.getBoardStatistics(
                boardId, userId, periodStart, periodEnd,
                Collections.emptyList(), Collections.emptyList(),
                Collections.emptyList(), Collections.emptyList());
        data.put("statistics", stats);

        // Management statistics
        ManagementResponse.ManagementStatistics management = managementService.getManagementStatistics(
                boardId, userId, null, 3, 2);
        data.put("management", management);

        // Board-wide comments
        List<Comment> comments = commentRepository.findByBoardAndDateRange(boardId, startDT, endDT);
        data.put("comments", formatComments(comments));
    }

    private void gatherPersonalData(Map<String, Object> data, String boardId, String userId,
                                    LocalDate periodStart, LocalDate periodEnd,
                                    LocalDateTime startDT, LocalDateTime endDT) {
        // Personal statistics
        StatisticsResponse.PersonalStatistics stats = statisticsService.getPersonalStatistics(
                boardId, userId, periodStart, periodEnd);
        data.put("statistics", stats);

        // Personal comments
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        data.put("user_name", user.getName());

        List<Comment> comments = commentRepository.findByBoardAndAuthorAndDateRange(
                boardId, userId, startDT, endDT);
        data.put("comments", formatComments(comments));
    }

    private List<Map<String, String>> formatComments(List<Comment> comments) {
        return comments.stream()
                .limit(MAX_COMMENTS)
                .map(c -> {
                    Map<String, String> map = new LinkedHashMap<>();
                    map.put("author", c.getAuthor() != null ? c.getAuthor().getName() : "Unknown");
                    map.put("task_title", c.getTask() != null ? c.getTask().getTitle() : "Unknown");
                    String content = c.getContent();
                    if (content != null && content.length() > MAX_COMMENT_LENGTH) {
                        content = content.substring(0, MAX_COMMENT_LENGTH) + "...";
                    }
                    map.put("content", content != null ? content : "");
                    map.put("created_at", c.getCreatedAt() != null ? c.getCreatedAt().toString() : "");
                    return map;
                })
                .collect(Collectors.toList());
    }
}
