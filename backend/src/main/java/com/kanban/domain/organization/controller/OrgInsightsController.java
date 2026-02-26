package com.kanban.domain.organization.controller;

import com.kanban.domain.organization.dto.OrgBoardResourceResponse;
import com.kanban.domain.organization.dto.OrgInsightsSummaryResponse;
import com.kanban.domain.organization.dto.OrgMemberContributionResponse;
import com.kanban.domain.organization.dto.OrgMemberDetailResponse;
import com.kanban.domain.organization.service.OrgInsightsService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}/insights")
@RequiredArgsConstructor
public class OrgInsightsController {

    private final OrgInsightsService insightsService;

    @GetMapping("/summary")
    public ResponseEntity<OrgInsightsSummaryResponse.Summary> getSummary(
            @PathVariable String orgId,
            @RequestParam("start_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam("end_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(insightsService.getSummary(orgId, principal.getUserId(), startDate, endDate));
    }

    @GetMapping("/members")
    public ResponseEntity<List<OrgMemberContributionResponse.MemberContribution>> getMemberContributions(
            @PathVariable String orgId,
            @RequestParam("start_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam("end_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(value = "department_id", required = false) String departmentId,
            @RequestParam(value = "job_group_id", required = false) String jobGroupId,
            @RequestParam(value = "sort_by", defaultValue = "work_minutes") String sortBy,
            @RequestParam(value = "sort_dir", defaultValue = "desc") String sortDir,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(insightsService.getMemberContributions(
                orgId, principal.getUserId(), startDate, endDate, departmentId, jobGroupId, sortBy, sortDir));
    }

    @GetMapping("/members/{memberId}")
    public ResponseEntity<OrgMemberDetailResponse.Detail> getMemberDetail(
            @PathVariable String orgId,
            @PathVariable String memberId,
            @RequestParam("start_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam("end_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(insightsService.getMemberDetail(orgId, principal.getUserId(), memberId, startDate, endDate));
    }

    @GetMapping("/boards")
    public ResponseEntity<OrgBoardResourceResponse.ListResponse> getBoardResources(
            @PathVariable String orgId,
            @RequestParam("start_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam("end_date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(value = "sort_by", defaultValue = "work_minutes") String sortBy,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(insightsService.getBoardResources(orgId, principal.getUserId(), startDate, endDate, sortBy));
    }
}
