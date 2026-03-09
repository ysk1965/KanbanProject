package com.kanban.domain.organization.controller;

import com.kanban.domain.organization.dto.AttendanceRequest;
import com.kanban.domain.organization.dto.AttendanceResponse;
import com.kanban.domain.organization.service.OrgAttendanceService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}/attendance")
@RequiredArgsConstructor
public class OrgAttendanceController {

    private final OrgAttendanceService attendanceService;

    @PostMapping("/clock-in")
    public ResponseEntity<AttendanceResponse.RecordDetail> clockIn(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(attendanceService.clockIn(orgId, principal.getUserId()));
    }

    @PostMapping("/clock-out")
    public ResponseEntity<AttendanceResponse.RecordDetail> clockOut(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(attendanceService.clockOut(orgId, principal.getUserId()));
    }

    @PostMapping("/cancel-clock-out")
    public ResponseEntity<AttendanceResponse.RecordDetail> cancelClockOut(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(attendanceService.cancelClockOut(orgId, principal.getUserId()));
    }

    @GetMapping("/my-records")
    public ResponseEntity<AttendanceResponse.MyRecordsResponse> getMyRecords(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month) {
        int y = year != null ? year : LocalDate.now().getYear();
        int m = month != null ? month : LocalDate.now().getMonthValue();
        return ResponseEntity.ok(attendanceService.getMyRecords(orgId, principal.getUserId(), y, m));
    }

    @GetMapping("/today")
    public ResponseEntity<AttendanceResponse.TodayStatus> getTodayStatus(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(attendanceService.getTodayStatus(orgId, principal.getUserId()));
    }

    @GetMapping("/today/members")
    public ResponseEntity<AttendanceResponse.TodayMembersResponse> getTodayMembers(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(attendanceService.getTodayMembers(orgId, principal.getUserId()));
    }

    @GetMapping("/team-summary")
    public ResponseEntity<AttendanceResponse.TeamSummaryResponse> getTeamSummary(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam int year,
            @RequestParam int month,
            @RequestParam(name = "department_id", required = false) String departmentId) {
        return ResponseEntity.ok(attendanceService.getTeamSummary(orgId, principal.getUserId(), year, month, departmentId));
    }

    @PutMapping("/records/{recordId}")
    public ResponseEntity<AttendanceResponse.RecordDetail> adminModify(
            @PathVariable String orgId,
            @PathVariable String recordId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody AttendanceRequest.AdminModify request) {
        return ResponseEntity.ok(attendanceService.adminModify(orgId, principal.getUserId(), recordId, request));
    }

    @GetMapping("/policy")
    public ResponseEntity<AttendanceResponse.PolicyResponse> getPolicy(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(attendanceService.getPolicy(orgId, principal.getUserId()));
    }

    @PutMapping("/policy")
    public ResponseEntity<AttendanceResponse.PolicyResponse> updatePolicy(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody AttendanceRequest.UpdatePolicy request) {
        return ResponseEntity.ok(attendanceService.updatePolicy(orgId, principal.getUserId(), request));
    }

    @GetMapping("/holidays")
    public ResponseEntity<List<AttendanceResponse.HolidayResponse>> getHolidays(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(attendanceService.getHolidays(orgId, principal.getUserId()));
    }

    @PostMapping("/holidays")
    public ResponseEntity<AttendanceResponse.HolidayResponse> createHoliday(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody AttendanceRequest.CreateHoliday request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(attendanceService.createHoliday(orgId, principal.getUserId(), request));
    }

    @DeleteMapping("/holidays/{holidayId}")
    public ResponseEntity<Void> deleteHoliday(
            @PathVariable String orgId,
            @PathVariable String holidayId,
            @AuthenticationPrincipal UserPrincipal principal) {
        attendanceService.deleteHoliday(orgId, principal.getUserId(), holidayId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> exportCsv(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam int year,
            @RequestParam int month,
            @RequestParam(name = "department_id", required = false) String departmentId) {
        String csv = attendanceService.exportCsv(orgId, principal.getUserId(), year, month, departmentId);
        byte[] bytes = csv.getBytes(java.nio.charset.StandardCharsets.UTF_8);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType("text/csv; charset=UTF-8"));
        headers.setContentDispositionFormData("attachment", String.format("attendance_%d_%02d.csv", year, month));

        return new ResponseEntity<>(bytes, headers, HttpStatus.OK);
    }
}
