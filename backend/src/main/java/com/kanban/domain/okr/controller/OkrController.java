package com.kanban.domain.okr.controller;

import com.kanban.domain.okr.dto.*;
import com.kanban.domain.okr.service.OkrService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/organizations/{orgId}/okr")
@RequiredArgsConstructor
public class OkrController {

    private final OkrService okrService;

    // ==================== Cycles ====================

    @GetMapping("/cycles")
    public ResponseEntity<List<OkrCycleResponse.Detail>> getCycles(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<OkrCycleResponse.Detail> response = okrService.getCycles(orgId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/cycles")
    public ResponseEntity<OkrCycleResponse.Detail> createCycle(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OkrCycleRequest.Create request) {
        OkrCycleResponse.Detail response = okrService.createCycle(orgId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/cycles/{cycleId}")
    public ResponseEntity<OkrCycleResponse.Detail> updateCycle(
            @PathVariable String orgId,
            @PathVariable String cycleId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OkrCycleRequest.Update request) {
        OkrCycleResponse.Detail response = okrService.updateCycle(orgId, cycleId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/cycles/{cycleId}")
    public ResponseEntity<Map<String, String>> deleteCycle(
            @PathVariable String orgId,
            @PathVariable String cycleId,
            @AuthenticationPrincipal UserPrincipal principal) {
        okrService.deleteCycle(orgId, cycleId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "OKR 사이클이 삭제되었습니다."));
    }

    // ==================== Tree ====================

    @GetMapping("/cycles/{cycleId}/tree")
    public ResponseEntity<OkrTreeResponse> getTree(
            @PathVariable String orgId,
            @PathVariable String cycleId,
            @AuthenticationPrincipal UserPrincipal principal) {
        OkrTreeResponse response = okrService.getTree(orgId, cycleId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    // ==================== Objectives ====================

    @PostMapping("/cycles/{cycleId}/objectives")
    public ResponseEntity<OkrObjectiveResponse.Detail> createObjective(
            @PathVariable String orgId,
            @PathVariable String cycleId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OkrObjectiveRequest.Create request) {
        OkrObjectiveResponse.Detail response = okrService.createObjective(
                orgId, cycleId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/objectives/{objectiveId}")
    public ResponseEntity<OkrObjectiveResponse.Detail> updateObjective(
            @PathVariable String orgId,
            @PathVariable String objectiveId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OkrObjectiveRequest.Update request) {
        OkrObjectiveResponse.Detail response = okrService.updateObjective(
                orgId, objectiveId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/objectives/{objectiveId}")
    public ResponseEntity<Map<String, String>> deleteObjective(
            @PathVariable String orgId,
            @PathVariable String objectiveId,
            @AuthenticationPrincipal UserPrincipal principal) {
        okrService.deleteObjective(orgId, objectiveId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "OKR 목표가 삭제되었습니다."));
    }

    // ==================== Key Results ====================

    @PostMapping("/objectives/{objectiveId}/key-results")
    public ResponseEntity<OkrKeyResultResponse.Detail> createKeyResult(
            @PathVariable String orgId,
            @PathVariable String objectiveId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OkrKeyResultRequest.Create request) {
        OkrKeyResultResponse.Detail response = okrService.createKeyResult(
                orgId, objectiveId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/key-results/{krId}")
    public ResponseEntity<OkrKeyResultResponse.Detail> updateKeyResult(
            @PathVariable String orgId,
            @PathVariable String krId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OkrKeyResultRequest.Update request) {
        OkrKeyResultResponse.Detail response = okrService.updateKeyResult(
                orgId, krId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/key-results/{krId}")
    public ResponseEntity<Map<String, String>> deleteKeyResult(
            @PathVariable String orgId,
            @PathVariable String krId,
            @AuthenticationPrincipal UserPrincipal principal) {
        okrService.deleteKeyResult(orgId, krId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "OKR 핵심 결과가 삭제되었습니다."));
    }

    // ==================== Check-ins ====================

    @GetMapping("/key-results/{krId}/checkins")
    public ResponseEntity<List<OkrCheckInResponse.Detail>> getCheckIns(
            @PathVariable String orgId,
            @PathVariable String krId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<OkrCheckInResponse.Detail> response = okrService.getCheckIns(
                orgId, krId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/key-results/{krId}/checkins")
    public ResponseEntity<OkrCheckInResponse.Detail> createCheckIn(
            @PathVariable String orgId,
            @PathVariable String krId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OkrCheckInRequest.Create request) {
        OkrCheckInResponse.Detail response = okrService.createCheckIn(
                orgId, krId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}
