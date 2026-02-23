package com.kanban.domain.personal.controller;

import com.kanban.domain.personal.dto.PersonalDashboardResponse;
import com.kanban.domain.personal.dto.PersonalOverviewResponse;
import com.kanban.domain.personal.service.PersonalDashboardService;
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
@RequestMapping("/api/v1/personal/dashboard")
@RequiredArgsConstructor
public class PersonalDashboardController {

    private final PersonalDashboardService personalDashboardService;

    @GetMapping("/today")
    public ResponseEntity<PersonalDashboardResponse> getTodayDashboard(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(value = "date", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(personalDashboardService.getTodayDashboard(principal.getUserId(), date));
    }

    @GetMapping("/overview")
    public ResponseEntity<PersonalOverviewResponse> getOverview(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(value = "date", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(personalDashboardService.getOverview(principal.getUserId(), date));
    }
}
