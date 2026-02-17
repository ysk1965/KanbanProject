package com.kanban.domain.personal.controller;

import com.kanban.domain.personal.dto.PersonalEventRequest;
import com.kanban.domain.personal.dto.PersonalEventResponse;
import com.kanban.domain.personal.service.PersonalEventService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/personal/events")
@RequiredArgsConstructor
public class PersonalEventController {

    private final PersonalEventService personalEventService;

    @GetMapping
    public ResponseEntity<List<PersonalEventResponse.Detail>> getEventsByDate(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        List<PersonalEventResponse.Detail> events =
                personalEventService.getEventsByDate(principal.getUserId(), date);
        return ResponseEntity.ok(events);
    }

    @GetMapping("/weekly")
    public ResponseEntity<List<PersonalEventResponse.Detail>> getEventsByDateRange(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam("start_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam("end_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        List<PersonalEventResponse.Detail> events =
                personalEventService.getEventsByDateRange(principal.getUserId(), startDate, endDate);
        return ResponseEntity.ok(events);
    }

    @PostMapping
    public ResponseEntity<PersonalEventResponse.Detail> createEvent(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody PersonalEventRequest.Create request) {
        PersonalEventResponse.Detail response =
                personalEventService.createEvent(principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{eventId}")
    public ResponseEntity<PersonalEventResponse.Detail> updateEvent(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String eventId,
            @Valid @RequestBody PersonalEventRequest.Update request) {
        PersonalEventResponse.Detail response =
                personalEventService.updateEvent(principal.getUserId(), eventId, request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{eventId}")
    public ResponseEntity<Map<String, String>> deleteEvent(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String eventId,
            @RequestParam(defaultValue = "THIS_ONLY") String scope) {
        personalEventService.deleteEvent(principal.getUserId(), eventId, scope);
        return ResponseEntity.ok(Map.of("message", "일정이 삭제되었습니다"));
    }
}
