package com.kanban.domain.schedule.controller;

import com.kanban.domain.schedule.dto.ScheduleRequest;
import com.kanban.domain.schedule.dto.ScheduleResponse;
import com.kanban.domain.schedule.service.ScheduleFacadeService;
import com.kanban.domain.schedule.service.ScheduleService;
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
@RequestMapping("/api/v1/boards/{boardId}/schedules")
@RequiredArgsConstructor
public class ScheduleController {

    private final ScheduleService scheduleService;
    private final ScheduleFacadeService scheduleFacadeService;

    @GetMapping
    public ResponseEntity<ScheduleResponse.DailySchedule> getDailySchedule(
            @PathVariable String boardId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) List<String> assigneeIds,
            @RequestParam(required = false, defaultValue = "false") boolean includeOrgSchedules,
            @AuthenticationPrincipal UserPrincipal principal) {
        ScheduleResponse.DailySchedule response = scheduleService.getDailySchedule(
                boardId, date, assigneeIds, principal.getUserId(), includeOrgSchedules);
        return ResponseEntity.ok(response);
    }

    /**
     * 주간 스케줄 조회 (7일치 데이터 한 번에)
     * 기존 7개 API 호출 → 1개로 통합
     */
    @GetMapping("/weekly")
    public ResponseEntity<ScheduleResponse.WeeklySchedule> getWeeklySchedule(
            @PathVariable String boardId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) List<String> assigneeIds,
            @RequestParam(required = false, defaultValue = "false") boolean includeOrgSchedules,
            @AuthenticationPrincipal UserPrincipal principal) {
        ScheduleResponse.WeeklySchedule response = scheduleService.getWeeklySchedule(
                boardId, startDate, endDate, assigneeIds, principal.getUserId(), includeOrgSchedules);
        return ResponseEntity.ok(response);
    }

    /**
     * Day 모드 통합 조회 (스케줄 + 데일리 체크리스트)
     * 기존 2개 API 호출 → 1개로 통합
     */
    @GetMapping("/daily-full")
    public ResponseEntity<ScheduleResponse.DailyFull> getDailyFull(
            @PathVariable String boardId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) List<String> assigneeIds,
            @RequestParam(required = false, defaultValue = "false") boolean includeOrgSchedules,
            @AuthenticationPrincipal UserPrincipal principal) {
        ScheduleResponse.DailyFull response = scheduleFacadeService.getDailyFull(
                boardId, date, assigneeIds, principal.getUserId(), includeOrgSchedules);
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<ScheduleResponse.BlockDetail> createScheduleBlock(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ScheduleRequest.Create request) {
        ScheduleResponse.BlockDetail response = scheduleService.createScheduleBlock(
                boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/with-checklist-item")
    public ResponseEntity<ScheduleResponse.BlockDetail> createWithChecklistItem(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ScheduleRequest.CreateWithChecklistItem request) {
        ScheduleResponse.BlockDetail response = scheduleService.createWithChecklistItem(
                boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{blockId}")
    public ResponseEntity<ScheduleResponse.BlockDetail> updateScheduleBlock(
            @PathVariable String boardId,
            @PathVariable String blockId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ScheduleRequest.Update request) {
        ScheduleResponse.BlockDetail response = scheduleService.updateScheduleBlock(
                boardId, blockId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{blockId}")
    public ResponseEntity<Map<String, String>> deleteScheduleBlock(
            @PathVariable String boardId,
            @PathVariable String blockId,
            @AuthenticationPrincipal UserPrincipal principal) {
        scheduleService.deleteScheduleBlock(boardId, blockId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "스케줄 블록이 삭제되었습니다"));
    }

    @GetMapping("/settings")
    public ResponseEntity<ScheduleResponse.SettingsInfo> getScheduleSettings(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        ScheduleResponse.SettingsInfo response = scheduleService.getScheduleSettings(
                boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PutMapping("/settings")
    public ResponseEntity<ScheduleResponse.SettingsInfo> updateScheduleSettings(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ScheduleRequest.UpdateSettings request) {
        ScheduleResponse.SettingsInfo response = scheduleService.updateScheduleSettings(
                boardId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/scheduled-task-ids")
    public ResponseEntity<Map<String, Object>> getScheduledTaskIds(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<String> taskIds = scheduleService.getScheduledTaskIds(
                boardId, principal.getUserId());
        return ResponseEntity.ok(Map.of("task_ids", taskIds));
    }

    @GetMapping("/checklist-item/{checklistItemId}")
    public ResponseEntity<List<ScheduleResponse.BlockDetail>> getSchedulesByChecklistItem(
            @PathVariable String boardId,
            @PathVariable String checklistItemId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<ScheduleResponse.BlockDetail> response = scheduleService.getSchedulesByChecklistItem(
                boardId, checklistItemId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/checklist-items/batch")
    public ResponseEntity<Map<String, List<ScheduleResponse.BlockDetail>>> getBatchSchedulesByChecklistItems(
            @PathVariable String boardId,
            @Valid @RequestBody ScheduleRequest.BatchChecklistItemSchedules request,
            @AuthenticationPrincipal UserPrincipal principal) {
        Map<String, List<ScheduleResponse.BlockDetail>> response = scheduleService.getSchedulesByChecklistItems(
                boardId, request.getChecklistItemIds(), principal.getUserId());
        return ResponseEntity.ok(response);
    }
}
