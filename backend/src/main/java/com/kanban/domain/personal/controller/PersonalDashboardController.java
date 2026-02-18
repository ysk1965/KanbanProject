package com.kanban.domain.personal.controller;

import com.kanban.domain.personal.dto.PersonalDashboardResponse;
import com.kanban.domain.personal.service.PersonalDashboardService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/personal/dashboard")
@RequiredArgsConstructor
public class PersonalDashboardController {

    private final PersonalDashboardService personalDashboardService;

    @GetMapping("/today")
    public ResponseEntity<PersonalDashboardResponse> getTodayDashboard(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(personalDashboardService.getTodayDashboard(principal.getUserId()));
    }
}
