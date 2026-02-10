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
import com.kanban.domain.notification.NotificationType;
import com.kanban.domain.notification.service.NotificationService;
import com.kanban.domain.integration.slack.service.SlackNotificationService;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MeetingService {

    private final MeetingRepository meetingRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final NotificationService notificationService;
    private final SlackNotificationService slackNotificationService;
    private final ObjectMapper objectMapper;

    public List<MeetingResponse.Summary> getMeetingsByDate(String boardId, LocalDate date, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        List<Meeting> meetings = meetingRepository.findByBoardIdAndMeetingDateOrderByStartTimeAsc(boardId, date);

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

        return MeetingResponse.Detail.of(meeting, participants, deserializeAiSuggestions(meeting));
    }

    @Transactional
    public MeetingResponse.Detail createMeeting(String boardId, String userId, MeetingRequest.Create request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Meeting meeting = Meeting.builder()
                .board(board)
                .title(request.getTitle())
                .meetingDate(request.getMeetingDate())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .memo(request.getMemo())
                .color(request.getColor() != null ? request.getColor() : "#8B5CF6")
                .createdBy(creator)
                .build();

        meetingRepository.save(meeting);

        log.info("Meeting created: {} by user: {}", meeting.getId(), userId);

        return MeetingResponse.Detail.of(meeting, List.of(), null);
    }

    @Transactional
    public MeetingResponse.Detail updateMeeting(String boardId, String meetingId, String userId, MeetingRequest.Update request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEETING_NOT_FOUND));

        if (!meeting.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEETING_NOT_FOUND);
        }

        meeting.update(
                request.getTitle(),
                request.getMeetingDate(),
                request.getStartTime(),
                request.getEndTime(),
                request.getMemo(),
                request.getColor()
        );

        List<User> participants = scheduleBlockRepository.findDistinctAssigneesByMeetingId(meetingId);

        log.info("Meeting updated: {} by user: {}", meetingId, userId);

        return MeetingResponse.Detail.of(meeting, participants, deserializeAiSuggestions(meeting));
    }

    @Transactional
    public void deleteMeeting(String boardId, String meetingId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEETING_NOT_FOUND));

        if (!meeting.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MEETING_NOT_FOUND);
        }

        // schedule_blocks의 meeting_id는 ON DELETE SET NULL로 자동 처리
        meetingRepository.delete(meeting);

        log.info("Meeting deleted: {} by user: {}", meetingId, userId);
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

        return MeetingResponse.TranscriptResult.builder()
                .meetingId(meetingId)
                .transcript(meeting.getTranscript())
                .build();
    }

    @Transactional
    public void notifyParticipants(String boardId, String meetingId, String userId) {
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
        slackNotificationService.sendMeetingMemoNotifications(meeting, sender, board, memberUserIds);

        log.info("Meeting memo notifications sent for meeting: {} to {} members", meetingId, memberUserIds.size());
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
}
