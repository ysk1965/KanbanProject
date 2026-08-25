package com.kanban.domain.calendar.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.calendar.CalendarEvent;
import com.kanban.domain.calendar.CalendarEventType;
import com.kanban.domain.calendar.CalendarEventRepository;
import com.kanban.domain.calendar.dto.CalendarEventRequest;
import com.kanban.domain.calendar.dto.CalendarEventResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CalendarEventService {

    private final CalendarEventRepository calendarEventRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;

    public CalendarEventResponse.ListResponse getEvents(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        return CalendarEventResponse.ListResponse.of(
                calendarEventRepository.findByBoardIdWithDetails(boardId));
    }

    @Transactional
    public CalendarEventResponse.Item createEvent(String boardId, String userId, CalendarEventRequest.Create request) {
        boardService.checkMemberOrAbove(boardId, userId);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        CalendarEventType type = request.getEventType();
        validateDateRange(request.getStartDate(), request.getEndDate());
        User member = resolveMember(type, request.getMemberId());

        User creator = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        CalendarEvent event = CalendarEvent.builder()
                .board(board)
                .eventType(type)
                .member(member)
                .title(request.getTitle())
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .color(normalizeColor(request.getColor()))
                .recurring(Boolean.TRUE.equals(request.getRecurring()))
                .createdBy(creator)
                .build();
        event.updateMemo(request.getMemo(), creator);

        calendarEventRepository.save(event);
        log.info("CalendarEvent created: {} ({}) in board: {} by user: {}", event.getId(), type, boardId, userId);

        return CalendarEventResponse.Item.of(event);
    }

    @Transactional
    public CalendarEventResponse.Item updateEvent(String boardId, String eventId, String userId,
                                                  CalendarEventRequest.Update request) {
        boardService.checkMemberOrAbove(boardId, userId);

        CalendarEvent event = getEventWithBoardCheck(boardId, eventId);

        // 종료 타입 결정 (변경 요청이 있으면 반영 후 검증)
        CalendarEventType effectiveType = request.getEventType() != null ? request.getEventType() : event.getEventType();
        User member = request.getMemberId() != null
                ? resolveMember(effectiveType, request.getMemberId())
                : null;

        LocalDate effectiveStart = request.getStartDate() != null ? request.getStartDate() : event.getStartDate();
        LocalDate effectiveEnd = request.getEndDate() != null ? request.getEndDate() : event.getEndDate();
        validateDateRange(effectiveStart, effectiveEnd);

        event.updateInfo(
                request.getEventType(),
                member,
                request.getTitle(),
                request.getStartDate(),
                request.getEndDate(),
                request.getColor(),
                request.getRecurring()
        );

        log.info("CalendarEvent updated: {} in board: {} by user: {}", eventId, boardId, userId);
        return CalendarEventResponse.Item.of(event);
    }

    /** 공유 메모 덮어쓰기 — 일정 수정과 동일한 권한(멤버 이상). 빈 내용이면 비우기. */
    @Transactional
    public CalendarEventResponse.Item updateMemo(String boardId, String eventId, String userId,
                                                 CalendarEventRequest.UpdateMemo request) {
        boardService.checkMemberOrAbove(boardId, userId);

        CalendarEvent event = getEventWithBoardCheck(boardId, eventId);
        User editor = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        event.updateMemo(request.getMemo(), editor);

        log.info("CalendarEvent memo updated: {} in board: {} by user: {}", eventId, boardId, userId);
        return CalendarEventResponse.Item.of(event);
    }

    @Transactional
    public void deleteEvent(String boardId, String eventId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        CalendarEvent event = getEventWithBoardCheck(boardId, eventId);
        calendarEventRepository.delete(event);
        log.info("CalendarEvent deleted: {} in board: {} by user: {}", eventId, boardId, userId);
    }

    // ==================== helpers ====================

    private CalendarEvent getEventWithBoardCheck(String boardId, String eventId) {
        CalendarEvent event = calendarEventRepository.findById(eventId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CALENDAR_EVENT_NOT_FOUND));
        if (!event.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.CALENDAR_EVENT_NOT_FOUND);
        }
        return event;
    }

    /** MEMBER 카테고리는 대상 멤버가 필수, 그 외 타입은 멤버를 무시(null)한다. */
    private User resolveMember(CalendarEventType type, String memberId) {
        if (type != null && type.requiresMember()) {
            if (memberId == null || memberId.isBlank()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
            }
            return userRepository.findById(memberId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        }
        return null;
    }

    private void validateDateRange(LocalDate start, LocalDate end) {
        if (start != null && end != null && end.isBefore(start)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
    }

    private String normalizeColor(String color) {
        return (color == null || color.isBlank()) ? null : color;
    }
}
