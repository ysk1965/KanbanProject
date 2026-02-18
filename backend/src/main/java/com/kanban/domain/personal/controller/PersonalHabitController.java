package com.kanban.domain.personal.controller;

import com.kanban.domain.personal.dto.PersonalHabitRequest;
import com.kanban.domain.personal.dto.PersonalHabitResponse;
import com.kanban.domain.personal.service.PersonalHabitService;
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
@RequestMapping("/api/v1/personal/habits")
@RequiredArgsConstructor
public class PersonalHabitController {

    private final PersonalHabitService personalHabitService;

    @GetMapping
    public ResponseEntity<List<PersonalHabitResponse.Detail>> getActiveHabits(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(personalHabitService.getActiveHabits(principal.getUserId()));
    }

    @GetMapping("/{habitId}")
    public ResponseEntity<PersonalHabitResponse.Detail> getHabit(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String habitId) {
        return ResponseEntity.ok(personalHabitService.getHabit(principal.getUserId(), habitId));
    }

    @PostMapping
    public ResponseEntity<PersonalHabitResponse.Detail> createHabit(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody PersonalHabitRequest.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(personalHabitService.createHabit(principal.getUserId(), request));
    }

    @PutMapping("/{habitId}")
    public ResponseEntity<PersonalHabitResponse.Detail> updateHabit(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String habitId,
            @Valid @RequestBody PersonalHabitRequest.Update request) {
        return ResponseEntity.ok(personalHabitService.updateHabit(principal.getUserId(), habitId, request));
    }

    @DeleteMapping("/{habitId}")
    public ResponseEntity<Map<String, String>> deactivateHabit(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String habitId) {
        personalHabitService.deactivateHabit(principal.getUserId(), habitId);
        return ResponseEntity.ok(Map.of("message", "습관이 비활성화되었습니다"));
    }

    @PutMapping("/{habitId}/position")
    public ResponseEntity<Void> updatePosition(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String habitId,
            @RequestBody PersonalHabitRequest.PositionUpdate request) {
        personalHabitService.updateHabitPosition(principal.getUserId(), habitId, request.getPosition());
        return ResponseEntity.ok().build();
    }

    // ─── Check-in ───

    @PostMapping("/{habitId}/check-in")
    public ResponseEntity<PersonalHabitResponse.TodayItem> checkIn(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String habitId,
            @RequestBody(required = false) PersonalHabitRequest.CheckIn request) {
        return ResponseEntity.ok(personalHabitService.checkIn(principal.getUserId(), habitId, request));
    }

    @GetMapping("/{habitId}/logs")
    public ResponseEntity<List<PersonalHabitResponse.LogEntry>> getHabitLogs(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String habitId,
            @RequestParam("start_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam("end_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return ResponseEntity.ok(personalHabitService.getHabitLogs(principal.getUserId(), habitId, startDate, endDate));
    }

    @GetMapping("/today")
    public ResponseEntity<List<PersonalHabitResponse.TodayItem>> getTodayHabits(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(personalHabitService.getTodayHabits(principal.getUserId()));
    }

    @GetMapping("/weekly")
    public ResponseEntity<PersonalHabitResponse.WeeklyMatrix> getWeeklyMatrix(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam("start_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam("end_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return ResponseEntity.ok(personalHabitService.getWeeklyMatrix(principal.getUserId(), startDate, endDate));
    }
}
