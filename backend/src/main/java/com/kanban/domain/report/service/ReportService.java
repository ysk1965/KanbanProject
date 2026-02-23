package com.kanban.domain.report.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.meeting.MeetingRepository;
import com.kanban.domain.report.ReportRepository;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.WeeklyReport;
import com.kanban.domain.report.dto.ReportRequest;
import com.kanban.domain.report.dto.ReportResponse;
import com.kanban.domain.schedule.ScheduleBlock;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.statistics.dto.ManagementResponse;
import com.kanban.domain.statistics.dto.StatisticsResponse;
import com.kanban.domain.statistics.service.ManagementService;
import com.kanban.domain.statistics.service.StatisticsService;
import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.*;
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
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final MeetingRepository meetingRepository;
    private final ReportAIService reportAIService;
    private final ObjectMapper objectMapper;

    private static final int MAX_COMMENTS = 30;
    private static final int MAX_COMMENT_LENGTH = 100;
    private static final int MAX_MEETING_MEMO_LENGTH = 200;

    @Transactional
    public ReportResponse.Detail generateReport(String boardId, String userId, ReportRequest.Generate request) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        validateReportAccess(board);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        ReportType reportType = request.getReportType();

        // Resolve target user for personal reports
        String targetId = userId;
        User targetUser = user;
        if (reportType == ReportType.PERSONAL && request.getTargetUserId() != null
                && !request.getTargetUserId().equals(userId)) {
            // Admin/Owner can generate reports for other members
            boardService.checkAdminOrAbove(boardId, userId);
            boardService.checkMemberOrAbove(boardId, request.getTargetUserId());
            targetId = request.getTargetUserId();
            targetUser = userRepository.findById(targetId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        } else if (reportType == ReportType.TEAM) {
            boardService.checkAdminOrAbove(boardId, userId);
        } else {
            boardService.checkMemberOrAbove(boardId, userId);
        }

        // Check for existing report
        Optional<WeeklyReport> existing = findExistingReport(
                boardId, targetId, reportType, request.getPeriodStart(), request.getPeriodEnd());
        if (existing.isPresent()) {
            return ReportResponse.Detail.from(existing.get());
        }

        // Gather data and generate
        String dataJson = gatherData(boardId, targetId, reportType,
                request.getPeriodStart(), request.getPeriodEnd(), board.getName());

        String content = reportAIService.generateReport(reportType, dataJson, request.getLanguage(), boardId, userId);

        WeeklyReport report = WeeklyReport.builder()
                .board(board)
                .generatedBy(user)
                .reportType(reportType)
                .targetUserId(reportType == ReportType.PERSONAL ? targetId : null)
                .targetUserName(reportType == ReportType.PERSONAL ? targetUser.getName() : null)
                .periodStart(request.getPeriodStart())
                .periodEnd(request.getPeriodEnd())
                .content(content)
                .dataSnapshot(dataJson)
                .build();

        reportRepository.save(report);
        log.info("Generated {} report for board: {}, target: {}, by: {}", reportType, boardId, targetId, userId);

        return ReportResponse.Detail.from(report);
    }

    public ReportResponse.ListResponse getReports(String boardId, String userId,
                                                    ReportType reportType, String targetUserId) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateReportAccess(boardId);

        // Team reports require ADMIN+
        if (reportType == ReportType.TEAM) {
            boardService.checkAdminOrAbove(boardId, userId);
        }

        // Viewing other user's personal reports requires ADMIN+
        if (reportType == ReportType.PERSONAL && targetUserId != null && !targetUserId.equals(userId)) {
            boardService.checkAdminOrAbove(boardId, userId);
        }

        List<WeeklyReport> reports;
        if (reportType != null && targetUserId != null) {
            reports = reportRepository.findByBoardIdAndReportTypeAndTargetUserIdOrderByCreatedAtDesc(
                    boardId, reportType, targetUserId);
        } else if (reportType != null) {
            reports = reportRepository.findByBoardIdAndReportTypeOrderByCreatedAtDesc(boardId, reportType);
        } else {
            reports = reportRepository.findByBoardIdOrderByCreatedAtDesc(boardId);
        }

        List<ReportResponse.ListItem> items = reports.stream()
                .map(ReportResponse.ListItem::from)
                .collect(Collectors.toList());

        return ReportResponse.ListResponse.builder()
                .reports(items)
                .build();
    }

    public ReportResponse.Detail getReport(String boardId, String reportId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateReportAccess(boardId);

        WeeklyReport report = reportRepository.findById(reportId)
                .orElseThrow(() -> new BusinessException(ErrorCode.AI_REPORT_NOT_FOUND));

        if (!report.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        // Team reports require ADMIN+
        if (report.getReportType() == ReportType.TEAM) {
            boardService.checkAdminOrAbove(boardId, userId);
        }

        // Viewing other user's personal report requires ADMIN+
        if (report.getReportType() == ReportType.PERSONAL
                && report.getTargetUserId() != null
                && !report.getTargetUserId().equals(userId)) {
            boardService.checkAdminOrAbove(boardId, userId);
        }

        return ReportResponse.Detail.from(report);
    }

    @Transactional
    public ReportResponse.Detail regenerateReport(String boardId, String reportId, String userId, String language) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        validateReportAccess(board);

        WeeklyReport report = reportRepository.findById(reportId)
                .orElseThrow(() -> new BusinessException(ErrorCode.AI_REPORT_NOT_FOUND));

        if (!report.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        ReportType reportType = report.getReportType();
        if (reportType == ReportType.TEAM) {
            boardService.checkAdminOrAbove(boardId, userId);
        } else if (report.getTargetUserId() != null && !report.getTargetUserId().equals(userId)) {
            boardService.checkAdminOrAbove(boardId, userId);
        } else {
            boardService.checkMemberOrAbove(boardId, userId);
        }

        String dataUserId = report.getTargetUserId() != null ? report.getTargetUserId() : userId;
        String dataJson = gatherData(boardId, dataUserId, reportType,
                report.getPeriodStart(), report.getPeriodEnd(), board.getName());

        // Skip AI call if data hasn't changed since last generation
        if (report.getDataSnapshot() != null && hashData(dataJson).equals(hashData(report.getDataSnapshot()))) {
            log.info("Skipping AI call for report {} - data unchanged", reportId);
            return ReportResponse.Detail.from(report);
        }

        User regenerator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        String content = reportAIService.generateReport(reportType, dataJson, language, boardId, userId);
        report.updateContent(content, dataJson, regenerator);

        log.info("Regenerated {} report {} for board: {} by: {} (language: {})", reportType, reportId, boardId, userId, language);
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

        // Meetings in the period
        List<Meeting> meetings = meetingRepository.findByBoardIdAndMeetingDateBetweenOrderByMeetingDateAscStartTimeAsc(
                boardId, periodStart, periodEnd);
        data.put("meetings", formatMeetingsForTeam(meetings));
    }

    private void gatherPersonalData(Map<String, Object> data, String boardId, String userId,
                                    LocalDate periodStart, LocalDate periodEnd,
                                    LocalDateTime startDT, LocalDateTime endDT) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        data.put("user_name", user.getName());

        // 1. ScheduleBlock: 기간 내 사용자의 시간 기록
        List<ScheduleBlock> allBlocks = scheduleBlockRepository.findByBoardIdAndScheduledDateBetween(
                boardId, periodStart, periodEnd);
        List<ScheduleBlock> userBlocks = allBlocks.stream()
                .filter(sb -> sb.getAssignee() != null && sb.getAssignee().getId().equals(userId))
                .filter(sb -> sb.getChecklistItem() != null)
                .toList();

        // 2. ChecklistItem: 사용자에게 할당된 체크리스트
        List<ChecklistItem> userChecklists = checklistItemRepository.findByBoardIdAndAssigneeId(boardId, userId);

        // 3. Comment: 기간 내 사용자가 작성한 댓글
        List<Comment> userComments = commentRepository.findByBoardAndAuthorAndDateRange(
                boardId, userId, startDT, endDT);

        // 4. Task/Feature 계층 구성: ChecklistItem → Task → Feature 역추적
        // Task별 체크리스트 그룹핑
        Map<String, List<ChecklistItem>> checklistsByTask = userChecklists.stream()
                .collect(Collectors.groupingBy(ci -> ci.getTask().getId()));

        // Task별 시간 블록 그룹핑
        Map<String, List<ScheduleBlock>> blocksByTask = userBlocks.stream()
                .collect(Collectors.groupingBy(sb -> sb.getChecklistItem().getTask().getId()));

        // Task별 댓글 그룹핑
        Map<String, List<Comment>> commentsByTask = userComments.stream()
                .filter(c -> c.getTask() != null)
                .collect(Collectors.groupingBy(c -> c.getTask().getId()));

        // 관련된 모든 Task 수집 (체크리스트 + 시간블록 + 댓글에서)
        Set<String> allTaskIds = new HashSet<>();
        allTaskIds.addAll(checklistsByTask.keySet());
        allTaskIds.addAll(blocksByTask.keySet());
        allTaskIds.addAll(commentsByTask.keySet());

        // Task → Feature 그룹핑
        Map<String, List<Map<String, Object>>> featureTasksMap = new LinkedHashMap<>();
        Map<String, Feature> featureMap = new LinkedHashMap<>();

        int totalMinutes = 0;
        int completedChecklists = 0;
        int totalChecklists = userChecklists.size();

        for (String taskId : allTaskIds) {
            List<ChecklistItem> taskChecklists = checklistsByTask.getOrDefault(taskId, Collections.emptyList());
            List<ScheduleBlock> taskBlocks = blocksByTask.getOrDefault(taskId, Collections.emptyList());
            List<Comment> taskComments = commentsByTask.getOrDefault(taskId, Collections.emptyList());

            // Task 정보 가져오기 (체크리스트나 시간블록에서)
            Task task = null;
            if (!taskChecklists.isEmpty()) {
                task = taskChecklists.get(0).getTask();
            } else if (!taskBlocks.isEmpty()) {
                task = taskBlocks.get(0).getChecklistItem().getTask();
            } else if (!taskComments.isEmpty()) {
                task = taskComments.get(0).getTask();
            }
            if (task == null) continue;

            Feature feature = task.getFeature();
            String featureId = feature.getId();
            featureMap.putIfAbsent(featureId, feature);

            // 태스크 시간 계산
            int taskMinutes = taskBlocks.stream()
                    .mapToInt(sb -> (int) Duration.between(sb.getStartTime(), sb.getEndTime()).toMinutes())
                    .sum();
            totalMinutes += taskMinutes;

            // 체크리스트 완료 카운트
            completedChecklists += (int) taskChecklists.stream().filter(ChecklistItem::getIsCompleted).count();

            // 태스크 데이터 구성
            Map<String, Object> taskData = new LinkedHashMap<>();
            taskData.put("title", task.getTitle());
            taskData.put("block", task.getBlock() != null ? task.getBlock().getName() : "Unknown");
            taskData.put("completed", task.getIsCompleted());

            // 체크리스트 목록
            if (!taskChecklists.isEmpty()) {
                List<Map<String, Object>> clList = taskChecklists.stream().map(ci -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("title", ci.getTitle());
                    m.put("completed", ci.getIsCompleted());
                    return m;
                }).toList();
                taskData.put("checklists", clList);
            }

            // 시간 투입
            if (taskMinutes > 0) {
                taskData.put("time_minutes", taskMinutes);
                List<Map<String, Object>> timeDetails = taskBlocks.stream().map(sb -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("date", sb.getScheduledDate().toString());
                    m.put("minutes", (int) Duration.between(sb.getStartTime(), sb.getEndTime()).toMinutes());
                    return m;
                }).toList();
                taskData.put("time_details", timeDetails);
            }

            // 댓글
            if (!taskComments.isEmpty()) {
                List<Map<String, String>> cmList = taskComments.stream().limit(10).map(c -> {
                    Map<String, String> m = new LinkedHashMap<>();
                    String content = c.getContent();
                    if (content != null && content.length() > MAX_COMMENT_LENGTH) {
                        content = content.substring(0, MAX_COMMENT_LENGTH) + "...";
                    }
                    m.put("content", content != null ? content : "");
                    return m;
                }).toList();
                taskData.put("comments", cmList);
            }

            featureTasksMap.computeIfAbsent(featureId, k -> new ArrayList<>()).add(taskData);
        }

        // 5. Feature 단위로 조합
        List<Map<String, Object>> features = new ArrayList<>();
        for (Map.Entry<String, Feature> entry : featureMap.entrySet()) {
            Feature f = entry.getValue();
            Map<String, Object> featureData = new LinkedHashMap<>();
            featureData.put("title", f.getTitle());
            featureData.put("status", f.getStatus().name());
            featureData.put("progress", f.getCompletedTasks() + "/" + f.getTotalTasks());
            featureData.put("tasks", featureTasksMap.getOrDefault(entry.getKey(), Collections.emptyList()));
            features.add(featureData);
        }

        data.put("features", features);

        // Meetings: user is participant (via ScheduleBlock) or creator
        List<Meeting> allMeetings = meetingRepository.findByBoardIdAndMeetingDateBetweenOrderByMeetingDateAscStartTimeAsc(
                boardId, periodStart, periodEnd);
        Set<String> userMeetingIds = allBlocks.stream()
                .filter(sb -> sb.getAssignee() != null && sb.getAssignee().getId().equals(userId))
                .filter(sb -> sb.getMeeting() != null)
                .map(sb -> sb.getMeeting().getId())
                .collect(Collectors.toSet());
        List<Meeting> userMeetings = allMeetings.stream()
                .filter(m -> userMeetingIds.contains(m.getId()) || m.getCreatedBy().getId().equals(userId))
                .toList();
        data.put("meetings", formatMeetingsForPersonal(userMeetings));

        data.put("summary", Map.of(
                "total_minutes", totalMinutes,
                "completed_checklists", completedChecklists,
                "total_checklists", totalChecklists,
                "total_comments", userComments.size(),
                "total_meetings", userMeetings.size()
        ));
    }

    private String hashData(String data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(data.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            return data;
        }
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

    private List<Map<String, Object>> formatMeetingsForPersonal(List<Meeting> meetings) {
        return meetings.stream().map(m -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("title", m.getTitle());
            map.put("date", m.getMeetingDate().toString());
            if (m.getStartTime() != null) map.put("start_time", m.getStartTime().toString());
            if (m.getEndTime() != null) map.put("end_time", m.getEndTime().toString());
            String memo = m.getMemo();
            if (memo != null && !memo.isBlank()) {
                if (memo.length() > MAX_MEETING_MEMO_LENGTH) {
                    memo = memo.substring(0, MAX_MEETING_MEMO_LENGTH) + "...";
                }
                map.put("memo", memo);
            }
            map.put("has_transcript", m.getTranscript() != null && !m.getTranscript().isBlank());
            List<User> participants = scheduleBlockRepository.findDistinctAssigneesByMeetingId(m.getId());
            map.put("participants", participants.stream().map(User::getName).toList());
            return map;
        }).toList();
    }

    private List<Map<String, Object>> formatMeetingsForTeam(List<Meeting> meetings) {
        return meetings.stream().map(m -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("title", m.getTitle());
            map.put("date", m.getMeetingDate().toString());
            if (m.getStartTime() != null) map.put("start_time", m.getStartTime().toString());
            if (m.getEndTime() != null) map.put("end_time", m.getEndTime().toString());
            String memo = m.getMemo();
            if (memo != null && !memo.isBlank()) {
                if (memo.length() > MAX_MEETING_MEMO_LENGTH) {
                    memo = memo.substring(0, MAX_MEETING_MEMO_LENGTH) + "...";
                }
                map.put("memo", memo);
            }
            map.put("has_transcript", m.getTranscript() != null && !m.getTranscript().isBlank());
            map.put("created_by", m.getCreatedBy() != null ? m.getCreatedBy().getName() : "Unknown");
            List<User> participants = scheduleBlockRepository.findDistinctAssigneesByMeetingId(m.getId());
            map.put("participants", participants.stream().map(User::getName).toList());
            return map;
        }).toList();
    }

    private void validateReportAccess(Board board) {
        if (!board.canAccessReport()) {
            throw new BusinessException(ErrorCode.PREMIUM_FEATURE_REQUIRED);
        }
    }

    private void validateReportAccess(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        validateReportAccess(board);
    }
}
