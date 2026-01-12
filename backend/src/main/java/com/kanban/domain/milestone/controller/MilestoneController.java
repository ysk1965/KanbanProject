package com.kanban.domain.milestone.controller;

import com.kanban.domain.milestone.dto.MilestoneRequest;
import com.kanban.domain.milestone.dto.MilestoneResponse;
import com.kanban.domain.milestone.service.MilestoneService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

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
}
