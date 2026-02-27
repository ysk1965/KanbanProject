package com.kanban.domain.organization.controller;

import com.kanban.domain.organization.dto.OrgChartResponse;
import com.kanban.domain.organization.dto.OrgManagerRequest;
import com.kanban.domain.organization.service.OrgChartService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}")
@RequiredArgsConstructor
public class OrgChartController {

    private final OrgChartService orgChartService;

    @GetMapping("/chart")
    public ResponseEntity<OrgChartResponse.ChartData> getChart(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                orgChartService.getChart(orgId, principal.getUserId()));
    }

    @PutMapping("/members/{memberId}/manager")
    public ResponseEntity<Void> updateManager(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OrgManagerRequest request) {
        orgChartService.updateManager(orgId, principal.getUserId(), memberId, request);
        return ResponseEntity.ok().build();
    }
}
