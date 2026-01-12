package com.kanban.domain.feature.controller;

import com.kanban.domain.feature.dto.FeatureRequest;
import com.kanban.domain.feature.dto.FeatureResponse;
import com.kanban.domain.feature.service.FeatureService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/features")
@RequiredArgsConstructor
public class FeatureController {

    private final FeatureService featureService;

    @GetMapping
    public ResponseEntity<FeatureResponse.ListResponse> getFeatures(
            @PathVariable String boardId,
            @RequestParam(required = false) String milestoneId,
            @AuthenticationPrincipal UserPrincipal principal) {
        FeatureResponse.ListResponse response = featureService.getFeatures(boardId, principal.getUserId(), milestoneId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{featureId}")
    public ResponseEntity<FeatureResponse.Detail> getFeature(
            @PathVariable String boardId,
            @PathVariable String featureId,
            @AuthenticationPrincipal UserPrincipal principal) {
        FeatureResponse.Detail response = featureService.getFeature(boardId, featureId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    public ResponseEntity<FeatureResponse.Detail> createFeature(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody FeatureRequest.Create request) {
        FeatureResponse.Detail response = featureService.createFeature(boardId, principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{featureId}")
    public ResponseEntity<FeatureResponse.Detail> updateFeature(
            @PathVariable String boardId,
            @PathVariable String featureId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody FeatureRequest.Update request) {
        FeatureResponse.Detail response = featureService.updateFeature(boardId, featureId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{featureId}")
    public ResponseEntity<Map<String, String>> deleteFeature(
            @PathVariable String boardId,
            @PathVariable String featureId,
            @AuthenticationPrincipal UserPrincipal principal) {
        featureService.deleteFeature(boardId, featureId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "Feature가 삭제되었습니다"));
    }

    @PutMapping("/reorder")
    public ResponseEntity<FeatureResponse.ListResponse> reorderFeatures(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody FeatureRequest.Reorder request) {
        FeatureResponse.ListResponse response = featureService.reorderFeatures(boardId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }
}
