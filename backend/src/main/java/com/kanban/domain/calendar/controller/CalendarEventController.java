package com.kanban.domain.calendar.controller;

import com.kanban.domain.calendar.dto.CalendarEventRequest;
import com.kanban.domain.calendar.dto.CalendarEventResponse;
import com.kanban.domain.calendar.service.CalendarEventService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/calendar-events")
@RequiredArgsConstructor
public class CalendarEventController {

    private final CalendarEventService calendarEventService;

    @GetMapping
    public ResponseEntity<CalendarEventResponse.ListResponse> getEvents(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(calendarEventService.getEvents(boardId, userPrincipal.getUserId()));
    }

    @PostMapping
    public ResponseEntity<CalendarEventResponse.Item> createEvent(
            @PathVariable String boardId,
            @Valid @RequestBody CalendarEventRequest.Create request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(calendarEventService.createEvent(boardId, userPrincipal.getUserId(), request));
    }

    @PutMapping("/{eventId}")
    public ResponseEntity<CalendarEventResponse.Item> updateEvent(
            @PathVariable String boardId,
            @PathVariable String eventId,
            @Valid @RequestBody CalendarEventRequest.Update request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                calendarEventService.updateEvent(boardId, eventId, userPrincipal.getUserId(), request));
    }

    @PutMapping("/{eventId}/memo")
    public ResponseEntity<CalendarEventResponse.Item> updateMemo(
            @PathVariable String boardId,
            @PathVariable String eventId,
            @Valid @RequestBody CalendarEventRequest.UpdateMemo request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                calendarEventService.updateMemo(boardId, eventId, userPrincipal.getUserId(), request));
    }

    @DeleteMapping("/{eventId}")
    public ResponseEntity<Void> deleteEvent(
            @PathVariable String boardId,
            @PathVariable String eventId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        calendarEventService.deleteEvent(boardId, eventId, userPrincipal.getUserId());
        return ResponseEntity.ok().build();
    }
}
