package com.kanban.domain.personal.controller;

import com.kanban.domain.personal.dto.UnifiedCalendarResponse;
import com.kanban.domain.personal.service.PersonalCalendarService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/v1/personal/calendar")
@RequiredArgsConstructor
public class PersonalCalendarController {

    private final PersonalCalendarService personalCalendarService;

    @GetMapping("/unified")
    public ResponseEntity<UnifiedCalendarResponse> getUnifiedCalendar(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam("start_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam("end_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return ResponseEntity.ok(personalCalendarService.getUnifiedCalendar(
                principal.getUserId(), startDate, endDate));
    }
}
