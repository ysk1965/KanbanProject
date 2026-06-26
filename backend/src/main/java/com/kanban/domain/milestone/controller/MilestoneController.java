package com.kanban.domain.milestone.controller;

import com.kanban.domain.milestone.dto.MilestoneRequest;
import com.kanban.domain.milestone.dto.MilestoneResponse;
import com.kanban.domain.milestone.service.MilestoneService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/milestones")
@RequiredArgsConstructor
public class MilestoneController {

    private final MilestoneService milestoneService;

    @GetMapping
    public ResponseEntity<MilestoneResponse.ListResponse> getMilestones(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(milestoneService.getMilestones(boardId, userPrincipal.getUserId()));
    }

    @GetMapping("/{milestoneId}")
    public ResponseEntity<MilestoneResponse.Detail> getMilestone(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(milestoneService.getMilestone(boardId, milestoneId, userPrincipal.getUserId()));
    }

    @PostMapping
    public ResponseEntity<MilestoneResponse.Detail> createMilestone(
            @PathVariable String boardId,
            @Valid @RequestBody MilestoneRequest.Create request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(milestoneService.createMilestone(boardId, userPrincipal.getUserId(), request));
    }

    @PutMapping("/{milestoneId}")
    public ResponseEntity<MilestoneResponse.Detail> updateMilestone(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @Valid @RequestBody MilestoneRequest.Update request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(milestoneService.updateMilestone(boardId, milestoneId, userPrincipal.getUserId(), request));
    }

    @DeleteMapping("/{milestoneId}")
    public ResponseEntity<Void> deleteMilestone(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        milestoneService.deleteMilestone(boardId, milestoneId, userPrincipal.getUserId());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{milestoneId}/features")
    public ResponseEntity<MilestoneResponse.Detail> addFeatures(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @Valid @RequestBody MilestoneRequest.AddFeatures request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(milestoneService.addFeatures(boardId, milestoneId, userPrincipal.getUserId(), request));
    }

    @DeleteMapping("/{milestoneId}/features/{featureId}")
    public ResponseEntity<Void> removeFeature(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @PathVariable String featureId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        milestoneService.removeFeature(boardId, milestoneId, featureId, userPrincipal.getUserId());
        return ResponseEntity.ok().build();
    }

    /** 피처의 대표(홈) 마일스톤을 이 마일스톤으로 지정 */
    @PutMapping("/{milestoneId}/features/{featureId}/primary")
    public ResponseEntity<MilestoneResponse.Detail> setPrimaryFeature(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @PathVariable String featureId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(
                milestoneService.setPrimaryFeature(boardId, milestoneId, featureId, userPrincipal.getUserId()));
    }

    // ==================== Block Visibility Endpoints ====================

    @PutMapping("/{milestoneId}/blocks/{blockId}/visibility")
    public ResponseEntity<Void> toggleBlockVisibility(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @PathVariable String blockId,
            @RequestBody Map<String, Boolean> request,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        Boolean hidden = request.get("hidden");
        if (hidden == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        milestoneService.toggleBlockVisibility(boardId, milestoneId, blockId, hidden, userPrincipal.getUserId());
        return ResponseEntity.ok().build();
    }

    // ==================== Allocation Endpoints ====================

    @GetMapping("/{milestoneId}/allocations")
    public ResponseEntity<MilestoneResponse.AllocationListResponse> getAllocations(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(milestoneService.getAllocations(boardId, milestoneId, userPrincipal.getUserId()));
    }

    @PostMapping("/{milestoneId}/allocations")
    public ResponseEntity<MilestoneResponse.AllocationDto> createAllocation(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @Valid @RequestBody MilestoneRequest.CreateAllocation request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(milestoneService.createAllocation(boardId, milestoneId, userPrincipal.getUserId(), request));
    }

    @PutMapping("/{milestoneId}/allocations/{allocationId}")
    public ResponseEntity<MilestoneResponse.AllocationDto> updateAllocation(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @PathVariable String allocationId,
            @Valid @RequestBody MilestoneRequest.UpdateAllocation request,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        return ResponseEntity.ok(milestoneService.updateAllocation(boardId, milestoneId, allocationId, userPrincipal.getUserId(), request));
    }

    @DeleteMapping("/{milestoneId}/allocations/{allocationId}")
    public ResponseEntity<Void> deleteAllocation(
            @PathVariable String boardId,
            @PathVariable String milestoneId,
            @PathVariable String allocationId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        milestoneService.deleteAllocation(boardId, milestoneId, allocationId, userPrincipal.getUserId());
        return ResponseEntity.ok().build();
    }
}
