package com.kanban.domain.meeting.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.meeting.MeetingRepository;
import com.kanban.domain.meeting.dto.MeetingAIResponse;
import com.kanban.domain.meeting.dto.MeetingRequest;
import com.kanban.domain.meeting.dto.MeetingResponse;
import com.kanban.domain.note.Note;
import com.kanban.domain.note.NoteRepository;
import com.kanban.domain.note.NoteType;
import com.kanban.domain.note.dto.NoteResponse;
import com.kanban.domain.notification.NotificationType;
import com.kanban.domain.notification.service.NotificationService;
import com.kanban.domain.integration.slack.service.SlackNotificationService;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MeetingService {

    private static final String MEETING_NOTES_FOLDER = "회의록";

    private final MeetingRepository meetingRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final NoteRepository noteRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final NotificationService notificationService;
    private final SlackNotificationService slackNotificationService;
    private final WebSocketEventService webSocketEventService;
    private final ObjectMapper objectMapper;

    public List<MeetingResponse.Summary> getMeetingsByDate(String boardId, LocalDate date, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateMeetingAccess(boardId);

        List<Meeting> meetings = meetingRepository.findByBoardIdAndMeetingDateOrderByStartTimeAsc(boardId, date);

        return meetings.stream().map(meeting -> {
            int participantCount = scheduleBlockRepository.countDistinctAssigneeByMeetingId(meeting.getId());
            return MeetingResponse.Summary.of(meeting, participantCount);
        }).toList();
    }

    public List<MeetingResponse.Summary> getMeetingsByDateRange(String boardId, LocalDate startDate, LocalDate endDate, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateMeetingAccess(boardId);

        List<Meeting> meetings = meetingRepository.findByBoardIdAndMeetingDateBetweenOrderByMeetingDateAscStartTimeAsc(
                boardId, startDate, endDate);

        return meetings.stream().map(meeting -> {
            int participantCount = scheduleBlockRepository.countDistinctAssigneeByMeetingId(meeting.getId());
            return MeetingResponse.Summary.of(meeting, participantCount);
        }).toList();
    }

    public MeetingResponse.Detail getMeetingDetail(String boardId, String meetingId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEETING_NOT_FOUND));

        if (!meeting.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEETING_NOT_FOUND);
        }

        List<User> participants = scheduleBlockRepository.findDistinctAssigneesByMeetingId(meetingId);

        return MeetingResponse.Detail.of(meeting, participants,
                deserializeAiSuggestions(meeting), deserializeDiarizedTranscript(meeting));
    }

    @Transactional
    public MeetingResponse.Detail createMeeting(String boardId, String userId, MeetingRequest.Create request) {
        boardService.checkMemberOrAbove(boardId, userId);
        validateMeetingAccess(boardId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        String color = request.getColor() != null ? request.getColor() : "#8B5CF6";
        String recurrenceRule = request.getRecurrenceRule();
        String recurrenceGroupId = null;

        if (recurrenceRule != null && !recurrenceRule.isBlank()) {
            recurrenceGroupId = UUID.randomUUID().toString();
        }

        // recurrenceDaysOfWeek를 콤마 구분 문자열로 변환
        String daysOfWeekStr = null;
        if (recurrenceGroupId != null && request.getRecurrenceDaysOfWeek() != null
                && !request.getRecurrenceDaysOfWeek().isEmpty()) {
            daysOfWeekStr = request.getRecurrenceDaysOfWeek().stream()
                    .map(String::valueOf)
                    .collect(Collectors.joining(","));
        }

        // 첫 번째 인스턴스의 날짜 결정
        LocalDate firstMeetingDate = request.getMeetingDate();
        if (daysOfWeekStr != null && ("WEEKLY".equals(recurrenceRule) || "BIWEEKLY".equals(recurrenceRule))) {
            // 선택된 요일 중 meetingDate 이후 가장 가까운 날짜
            firstMeetingDate = findFirstMatchingDate(request.getMeetingDate(), request.getRecurrenceDaysOfWeek());
        }

        // 첫 번째 인스턴스 생성
        Meeting firstMeeting = Meeting.builder()
                .board(board)
                .title(request.getTitle())
                .meetingDate(firstMeetingDate)
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .memo(request.getMemo())
                .color(color)
                .recurrenceRule(recurrenceGroupId != null ? recurrenceRule : null)
                .recurrenceGroupId(recurrenceGroupId)
                .recurrenceEndDate(request.getRecurrenceEndDate())
                .recurrenceDaysOfWeek(daysOfWeekStr)
                .recurrenceWeekOfMonth(request.getRecurrenceWeekOfMonth())
                .createdBy(creator)
                .build();

        meetingRepository.save(firstMeeting);

        // 반복 인스턴스 생성
        if (recurrenceGroupId != null) {
            List<Meeting> recurringInstances = generateRecurringInstances(
                    board, creator, request, recurrenceRule, recurrenceGroupId, color,
                    firstMeetingDate, daysOfWeekStr, request.getRecurrenceWeekOfMonth());
            if (!recurringInstances.isEmpty()) {
                meetingRepository.saveAll(recurringInstances);
            }
            log.info("Recurring meeting created: group={}, instances={}", recurrenceGroupId, recurringInstances.size() + 1);
        } else {
            log.info("Meeting created: {} by user: {}", firstMeeting.getId(), userId);
        }

        MeetingResponse.Detail response = MeetingResponse.Detail.of(firstMeeting, List.of(), null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEETING_CREATED,
                userId, creator.getName(), response);

        return response;
    }

    private List<Meeting> generateRecurringInstances(Board board, User creator,
                                                      MeetingRequest.Create request,
                                                      String recurrenceRule, String recurrenceGroupId,
                                                      String color, LocalDate firstMeetingDate,
                                                      String daysOfWeekStr, Integer weekOfMonth) {
        List<Meeting> instances = new ArrayList<>();
        LocalDate maxDate = firstMeetingDate.plusDays(84); // 12주
        if (request.getRecurrenceEndDate() != null && request.getRecurrenceEndDate().isBefore(maxDate)) {
            maxDate = request.getRecurrenceEndDate();
        }

        List<DayOfWeek> targetDays = parseDaysOfWeek(daysOfWeekStr);

        if (!targetDays.isEmpty() && ("WEEKLY".equals(recurrenceRule) || "BIWEEKLY".equals(recurrenceRule))) {
            // 복수 요일 반복: 선택된 요일별로 인스턴스 생성
            int weekStep = "BIWEEKLY".equals(recurrenceRule) ? 2 : 1;
            LocalDate weekStart = firstMeetingDate.with(DayOfWeek.MONDAY);

            while (!weekStart.isAfter(maxDate)) {
                for (DayOfWeek dow : targetDays) {
                    LocalDate instanceDate = weekStart.with(dow);
                    if (!instanceDate.isAfter(firstMeetingDate)) continue;
                    if (instanceDate.isAfter(maxDate)) continue;

                    instances.add(buildRecurringInstance(board, creator, request, instanceDate,
                            recurrenceRule, recurrenceGroupId, color, daysOfWeekStr, weekOfMonth));
                }
                weekStart = weekStart.plusWeeks(weekStep);
            }
        } else if ("MONTHLY".equals(recurrenceRule) && weekOfMonth != null && !targetDays.isEmpty()) {
            // 매월 N번째 X요일 반복
            DayOfWeek targetDow = targetDays.get(0);
            LocalDate currentMonth = firstMeetingDate.plusMonths(1).withDayOfMonth(1);

            while (!currentMonth.isAfter(maxDate)) {
                LocalDate instanceDate = getNthDayOfWeekInMonth(currentMonth, targetDow, weekOfMonth);
                if (instanceDate != null && !instanceDate.isAfter(maxDate)) {
                    instances.add(buildRecurringInstance(board, creator, request, instanceDate,
                            recurrenceRule, recurrenceGroupId, color, daysOfWeekStr, weekOfMonth));
                }
                currentMonth = currentMonth.plusMonths(1);
            }
        } else {
            // 매월 날짜 기준 반복 (기존 로직)
            LocalDate currentDate = firstMeetingDate;
            while (true) {
                currentDate = getNextRecurrenceDate(currentDate, recurrenceRule);
                if (currentDate.isAfter(maxDate)) break;

                instances.add(buildRecurringInstance(board, creator, request, currentDate,
                        recurrenceRule, recurrenceGroupId, color, daysOfWeekStr, weekOfMonth));
            }
        }
        return instances;
    }

    /**
     * 해당 월의 N번째 특정 요일 날짜 반환
     */
    private LocalDate getNthDayOfWeekInMonth(LocalDate firstOfMonth, DayOfWeek dayOfWeek, int nth) {
        LocalDate firstTarget = firstOfMonth.with(TemporalAdjusters.firstInMonth(dayOfWeek));
        LocalDate result = firstTarget.plusWeeks(nth - 1);
        // 같은 달인지 확인
        if (result.getMonth() != firstOfMonth.getMonth()) return null;
        return result;
    }

    private Meeting buildRecurringInstance(Board board, User creator, MeetingRequest.Create request,
                                           LocalDate meetingDate, String recurrenceRule,
                                           String recurrenceGroupId, String color,
                                           String daysOfWeekStr, Integer weekOfMonth) {
        return Meeting.builder()
                .board(board)
                .title(request.getTitle())
                .meetingDate(meetingDate)
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .memo(request.getMemo())
                .color(color)
                .recurrenceRule(recurrenceRule)
                .recurrenceGroupId(recurrenceGroupId)
                .recurrenceEndDate(request.getRecurrenceEndDate())
                .recurrenceDaysOfWeek(daysOfWeekStr)
                .recurrenceWeekOfMonth(weekOfMonth)
                .createdBy(creator)
                .build();
    }

    /**
     * JS dayOfWeek(0=Sun,1=Mon,...,6=Sat) → Java DayOfWeek 변환 후 선택된 요일 목록 반환
     */
    private List<DayOfWeek> parseDaysOfWeek(String daysOfWeekStr) {
        if (daysOfWeekStr == null || daysOfWeekStr.isBlank()) return List.of();
        try {
            return List.of(daysOfWeekStr.split(",")).stream()
                    .map(String::trim)
                    .map(Integer::parseInt)
                    .map(this::jsDayToJavaDayOfWeek)
                    .sorted()
                    .toList();
        } catch (Exception e) {
            log.warn("Failed to parse recurrenceDaysOfWeek: {}", daysOfWeekStr);
            return List.of();
        }
    }

    /**
     * JS day index (0=Sun) → Java DayOfWeek (MONDAY=1 ... SUNDAY=7)
     */
    private DayOfWeek jsDayToJavaDayOfWeek(int jsDay) {
        return jsDay == 0 ? DayOfWeek.SUNDAY : DayOfWeek.of(jsDay);
    }

    /**
     * meetingDate 이후(당일 포함) 가장 가까운 선택 요일의 날짜 반환
     */
    private LocalDate findFirstMatchingDate(LocalDate meetingDate, List<Integer> daysOfWeek) {
        for (int i = 0; i < 7; i++) {
            LocalDate candidate = meetingDate.plusDays(i);
            int jsDay = candidate.getDayOfWeek() == DayOfWeek.SUNDAY ? 0 : candidate.getDayOfWeek().getValue();
            if (daysOfWeek.contains(jsDay)) {
                return candidate;
            }
        }
        return meetingDate; // fallback
    }

    private LocalDate getNextRecurrenceDate(LocalDate current, String rule) {
        return switch (rule.toUpperCase()) {
            case "WEEKLY" -> current.plusWeeks(1);
            case "BIWEEKLY" -> current.plusWeeks(2);
            case "MONTHLY" -> current.plusMonths(1);
            default -> current.plusYears(100); // 실질적으로 종료
        };
    }

    @Transactional
    public MeetingResponse.Detail updateMeeting(String boardId, String meetingId, String userId,
                                                 MeetingRequest.Update request, String scope) {
        boardService.checkMemberOrAbove(boardId, userId);

        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEETING_NOT_FOUND));

        if (!meeting.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEETING_NOT_FOUND);
        }

        if ("THIS_AND_FUTURE".equals(scope) && meeting.isRecurring()) {
            // 이 회의와 향후 모든 회의 업데이트
            List<Meeting> futureMeetings = meetingRepository.findByRecurrenceGroupIdFromDate(
                    meeting.getRecurrenceGroupId(), meeting.getMeetingDate());
            for (Meeting m : futureMeetings) {
                m.update(
                        request.getTitle(),
                        null, // meetingDate는 개별 유지
                        request.getStartTime(),
                        request.getEndTime(),
                        m.getId().equals(meetingId) ? request.getMemo() : null, // memo는 현재 회의만
                        request.getColor()
                );
                if (request.getRecurrenceEndDate() != null) {
                    m.updateRecurrenceEndDate(request.getRecurrenceEndDate());
                }
            }
            // recurrence_end_date 변경 시 종료일 이후 회의 삭제
            if (request.getRecurrenceEndDate() != null) {
                List<Meeting> allGroupMeetings = meetingRepository.findByRecurrenceGroupIdFromDate(
                        meeting.getRecurrenceGroupId(), request.getRecurrenceEndDate().plusDays(1));
                if (!allGroupMeetings.isEmpty()) {
                    meetingRepository.deleteAll(allGroupMeetings);
                    log.info("Deleted {} meetings after new recurrence end date {} for group={}",
                            allGroupMeetings.size(), request.getRecurrenceEndDate(), meeting.getRecurrenceGroupId());
                }
            }
            log.info("Recurring meetings updated from {}: group={}, count={} by user: {}",
                    meeting.getMeetingDate(), meeting.getRecurrenceGroupId(), futureMeetings.size(), userId);
        } else {
            meeting.update(
                    request.getTitle(),
                    request.getMeetingDate(),
                    request.getStartTime(),
                    request.getEndTime(),
                    request.getMemo(),
                    request.getColor()
            );
            log.info("Meeting updated: {} by user: {}", meetingId, userId);
        }

        List<User> participants = scheduleBlockRepository.findDistinctAssigneesByMeetingId(meetingId);

        User user = userRepository.findById(userId).orElse(null);
        MeetingResponse.Detail response = MeetingResponse.Detail.of(meeting, participants, deserializeAiSuggestions(meeting));
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEETING_UPDATED,
                userId, user != null ? user.getName() : null, response);

        return response;
    }

    @Transactional
    public void deleteMeeting(String boardId, String meetingId, String userId, String scope) {
        boardService.checkMemberOrAbove(boardId, userId);

        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEETING_NOT_FOUND));

        if (!meeting.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEETING_NOT_FOUND);
        }

        String deletedMeetingId = meeting.getId();

        if ("THIS_AND_FUTURE".equals(scope) && meeting.isRecurring()) {
            meetingRepository.deleteByRecurrenceGroupIdFromDate(
                    meeting.getRecurrenceGroupId(), meeting.getMeetingDate());
            log.info("Recurring meetings deleted from {}: group={} by user: {}",
                    meeting.getMeetingDate(), meeting.getRecurrenceGroupId(), userId);
        } else {
            // schedule_blocks의 meeting_id는 ON DELETE SET NULL로 자동 처리
            meetingRepository.delete(meeting);
            log.info("Meeting deleted: {} by user: {}", meetingId, userId);
        }

        User user = userRepository.findById(userId).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEETING_DELETED,
                userId, user != null ? user.getName() : null, Map.of("id", deletedMeetingId));
    }

    @Transactional
    public MeetingResponse.TranscriptResult updateTranscript(
            String boardId, String meetingId, String userId, String transcript) {
        boardService.checkMemberOrAbove(boardId, userId);

        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEETING_NOT_FOUND));
        if (!meeting.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEETING_NOT_FOUND);
        }

        meeting.updateTranscript(transcript);
        // Clear diarized transcript when manually editing (must re-transcribe to diarize again)
        meeting.updateDiarizedTranscript(null);
        meeting.updateSpeakerMapping(null);

        User user = userRepository.findById(userId).orElse(null);
        List<User> participants = scheduleBlockRepository.findDistinctAssigneesByMeetingId(meetingId);
        MeetingResponse.Detail detailResponse = MeetingResponse.Detail.of(meeting, participants,
                deserializeAiSuggestions(meeting), null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEETING_UPDATED,
                userId, user != null ? user.getName() : null, detailResponse);

        return MeetingResponse.TranscriptResult.builder()
                .meetingId(meetingId)
                .transcript(meeting.getTranscript())
                .diarizedTranscript(null)
                .build();
    }

    @Transactional
    public void notifyParticipants(String boardId, String meetingId, String userId, String originUrl) {
        boardService.checkMemberOrAbove(boardId, userId);

        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEETING_NOT_FOUND));

        if (!meeting.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEETING_NOT_FOUND);
        }

        Board board = meeting.getBoard();
        User sender = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 보드 전체 멤버 (본인 포함)
        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
        List<String> memberUserIds = members.stream()
                .map(m -> m.getUser().getId())
                .toList();

        // In-app notification
        notificationService.createMeetingMemoNotifications(meeting, sender, board, memberUserIds);
        // Slack notification (async)
        slackNotificationService.sendMeetingMemoNotifications(meeting, sender, board, memberUserIds, originUrl);

        log.info("Meeting memo notifications sent for meeting: {} to {} members", meetingId, memberUserIds.size());
    }

    @Transactional
    public NoteResponse.Detail saveToNote(String boardId, String meetingId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEETING_NOT_FOUND));
        if (!meeting.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEETING_NOT_FOUND);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        Board board = meeting.getBoard();

        // Find or create "회의록" folder
        Note folder = noteRepository.findAllByBoardIdNotDeleted(boardId).stream()
                .filter(n -> n.getType() == NoteType.FOLDER && n.getParent() == null
                        && MEETING_NOTES_FOLDER.equals(n.getTitle()))
                .findFirst()
                .orElseGet(() -> {
                    Note newFolder = Note.builder()
                            .board(board)
                            .type(NoteType.FOLDER)
                            .title(MEETING_NOTES_FOLDER)
                            .position(noteRepository.findNextRootPosition(boardId))
                            .depth(0)
                            .createdBy(user)
                            .updatedBy(user)
                            .build();
                    return noteRepository.save(newFolder);
                });

        // Build HTML content from meeting data
        String htmlContent = buildMeetingNoteContent(meeting);

        // Create document inside folder
        String title = meeting.getTitle() + " - " + meeting.getMeetingDate();
        int position = noteRepository.findNextChildPosition(folder.getId());

        Note note = Note.builder()
                .board(board)
                .parent(folder)
                .type(NoteType.DOCUMENT)
                .title(title)
                .content(htmlContent)
                .position(position)
                .depth(1)
                .createdBy(user)
                .updatedBy(user)
                .build();

        noteRepository.save(note);

        return NoteResponse.Detail.of(note, java.util.List.of(), 0);
    }

    @Transactional
    public MeetingResponse.SpeakerMappingResult updateSpeakerMapping(
            String boardId, String meetingId, String userId,
            Map<String, String> speakerMapping) {
        boardService.checkMemberOrAbove(boardId, userId);

        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEETING_NOT_FOUND));
        if (!meeting.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEETING_NOT_FOUND);
        }

        try {
            String mappingJson = objectMapper.writeValueAsString(speakerMapping);
            meeting.updateSpeakerMapping(mappingJson);
        } catch (Exception e) {
            log.error("Failed to serialize speaker mapping for meeting: {}", meetingId, e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }

        User user = userRepository.findById(userId).orElse(null);
        webSocketEventService.sendBoardEvent(boardId, BoardEventType.MEETING_UPDATED,
                userId, user != null ? user.getName() : null,
                Map.of("id", meetingId, "speakerMapping", speakerMapping));

        log.info("Speaker mapping updated for meeting: {} by user: {}", meetingId, userId);

        return MeetingResponse.SpeakerMappingResult.builder()
                .meetingId(meetingId)
                .speakerMapping(speakerMapping)
                .build();
    }

    private String buildMeetingNoteContent(Meeting meeting) {
        StringBuilder sb = new StringBuilder();
        sb.append("<h1>").append(escapeHtml(meeting.getTitle())).append("</h1>");
        sb.append("<p><strong>날짜:</strong> ").append(meeting.getMeetingDate()).append("</p>");
        if (meeting.getStartTime() != null) {
            sb.append("<p><strong>시간:</strong> ").append(meeting.getStartTime());
            if (meeting.getEndTime() != null) {
                sb.append(" ~ ").append(meeting.getEndTime());
            }
            sb.append("</p>");
        }

        if (meeting.getMemo() != null && !meeting.getMemo().isBlank()) {
            sb.append("<h2>메모</h2>");
            sb.append("<p>").append(escapeHtml(meeting.getMemo()).replace("\n", "<br>")).append("</p>");
        }

        // Use diarized transcript if available, otherwise fall back to plain transcript
        MeetingResponse.DiarizedTranscript diarized = deserializeDiarizedTranscript(meeting);
        if (diarized != null && diarized.getSegments() != null && !diarized.getSegments().isEmpty()) {
            sb.append("<h2>회의 녹취 (화자 분리)</h2>");

            // Build speaker name map from speaker_mapping
            Map<String, String> speakerNames = diarized.getSpeakerMapping();

            for (MeetingResponse.DiarizedSegment segment : diarized.getSegments()) {
                String displayName = segment.getSpeaker();
                if (speakerNames != null && speakerNames.containsKey(segment.getSpeaker())) {
                    String mappedName = speakerNames.get(segment.getSpeaker());
                    if (mappedName != null && !mappedName.isBlank()) {
                        displayName = mappedName;
                    }
                }
                sb.append("<p><strong>").append(escapeHtml(displayName)).append(":</strong> ");
                sb.append(escapeHtml(segment.getText())).append("</p>");
            }
        } else if (meeting.getTranscript() != null && !meeting.getTranscript().isBlank()) {
            sb.append("<h2>회의 녹취</h2>");
            sb.append("<p>").append(escapeHtml(meeting.getTranscript()).replace("\n", "<br>")).append("</p>");
        }

        // AI suggestions summary if available
        if (meeting.getAiSuggestions() != null && !meeting.getAiSuggestions().isBlank()) {
            MeetingAIResponse.Suggestions suggestions = deserializeAiSuggestions(meeting);
            if (suggestions != null && suggestions.getKeyPoints() != null && !suggestions.getKeyPoints().isEmpty()) {
                sb.append("<h2>핵심 포인트</h2><ul>");
                for (String point : suggestions.getKeyPoints()) {
                    sb.append("<li>").append(escapeHtml(point)).append("</li>");
                }
                sb.append("</ul>");
            }
        }

        return sb.toString();
    }

    private String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private MeetingAIResponse.Suggestions deserializeAiSuggestions(Meeting meeting) {
        String json = meeting.getAiSuggestions();
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readValue(json, MeetingAIResponse.Suggestions.class);
        } catch (Exception e) {
            log.warn("Failed to deserialize AI suggestions for meeting: {}", meeting.getId(), e);
            return null;
        }
    }

    private MeetingResponse.DiarizedTranscript deserializeDiarizedTranscript(Meeting meeting) {
        String json = meeting.getDiarizedTranscript();
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readValue(json, MeetingResponse.DiarizedTranscript.class);
        } catch (Exception e) {
            log.warn("Failed to deserialize diarized transcript for meeting: {}", meeting.getId(), e);
            return null;
        }
    }

    private void validateMeetingAccess(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        if (!board.canAccessMeeting()) {
            throw new BusinessException(ErrorCode.PREMIUM_FEATURE_REQUIRED);
        }
    }
}
