package com.kanban.domain.readingplan.controller;

import com.kanban.domain.readingplan.dto.ReadingPlanRequest;
import com.kanban.domain.readingplan.dto.ReadingPlanResponse;
import com.kanban.domain.readingplan.service.ReadingPlanService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * 함께 읽는 길 (통독 — 모임 길 · 나의 길). 계약서: docs/Tech/sermon-reading-plans-api.md
 *
 * <p>today 는 클라이언트 현지 날짜 문자열(yyyy-MM-dd) — 서비스가 RP001 로 검증한다.
 */
@RestController
@RequestMapping("/api/v1/reading-plans")
@RequiredArgsConstructor
public class ReadingPlanController {

    private final ReadingPlanService planService;

    @PostMapping
    public ResponseEntity<ReadingPlanResponse.PlanDetail> create(
            @AuthenticationPrincipal UserPrincipal principal, @RequestBody ReadingPlanRequest.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(planService.create(principal.getUserId(), request));
    }

    @GetMapping("/mine")
    public ResponseEntity<ReadingPlanResponse.Mine> mine(
            @AuthenticationPrincipal UserPrincipal principal, @RequestParam(required = false) String today) {
        return ResponseEntity.ok(planService.mine(principal.getUserId(), today));
    }

    @GetMapping("/group/{groupId}")
    public ResponseEntity<ReadingPlanResponse.GroupPlan> groupPlan(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String groupId,
            @RequestParam(required = false) String today) {
        return ResponseEntity.ok(planService.groupPlan(principal.getUserId(), groupId, today));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ReadingPlanResponse.PlanDetail> get(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String id,
            @RequestParam(required = false) String today) {
        return ResponseEntity.ok(planService.get(principal.getUserId(), id, today));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> end(@AuthenticationPrincipal UserPrincipal principal, @PathVariable String id) {
        planService.end(principal.getUserId(), id);
        return ResponseEntity.noContent().build();
    }

    // ───────────────── 도장 ─────────────────

    @PostMapping("/checks/chapter")
    public ResponseEntity<ReadingPlanResponse.Stamped> stampChapter(
            @AuthenticationPrincipal UserPrincipal principal, @RequestBody ReadingPlanRequest.StampChapter request) {
        return ResponseEntity.ok(planService.stampChapter(principal.getUserId(), request));
    }

    @PutMapping("/{id}/days/{dayNo}/check")
    public ResponseEntity<ReadingPlanResponse.PlanDetail> manualCheck(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String id,
            @PathVariable int dayNo,
            @RequestBody ReadingPlanRequest.ManualCheck request) {
        return ResponseEntity.ok(planService.manualCheck(principal.getUserId(), id, dayNo, request));
    }
}
