package com.kanban.domain.organization.controller;

import com.kanban.domain.organization.dto.OrgActivityResponse;
import com.kanban.domain.organization.service.OrgActivityService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}/activities")
@RequiredArgsConstructor
public class OrgActivityController {

    private final OrgActivityService orgActivityService;

    @GetMapping
    public ResponseEntity<OrgActivityResponse.ListResponse> getActivities(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime cursor,
            @RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(
                orgActivityService.getActivities(orgId, principal.getUserId(), cursor, limit));
    }
}
