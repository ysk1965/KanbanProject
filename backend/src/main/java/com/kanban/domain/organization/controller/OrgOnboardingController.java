package com.kanban.domain.organization.controller;

import com.kanban.domain.organization.OnboardingStatus;
import com.kanban.domain.organization.dto.OnboardingRequest;
import com.kanban.domain.organization.dto.OnboardingResponse;
import com.kanban.domain.organization.service.OrgOnboardingService;
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
@RequestMapping("/api/v1/organizations/{orgId}/onboarding")
@RequiredArgsConstructor
public class OrgOnboardingController {

    private final OrgOnboardingService onboardingService;

    // ==================== Template Endpoints ====================

    @GetMapping("/templates")
    public ResponseEntity<List<OnboardingResponse.TemplateSummary>> getTemplates(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                onboardingService.getTemplates(orgId, principal.getUserId()));
    }

    @GetMapping("/templates/{templateId}")
    public ResponseEntity<OnboardingResponse.TemplateDetail> getTemplate(
            @PathVariable String orgId,
            @PathVariable String templateId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                onboardingService.getTemplate(orgId, principal.getUserId(), templateId));
    }

    @PostMapping("/templates")
    public ResponseEntity<OnboardingResponse.TemplateDetail> createTemplate(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OnboardingRequest.CreateTemplate request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(
                onboardingService.createTemplate(orgId, principal.getUserId(), request));
    }

    @PutMapping("/templates/{templateId}")
    public ResponseEntity<OnboardingResponse.TemplateDetail> updateTemplate(
            @PathVariable String orgId,
            @PathVariable String templateId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OnboardingRequest.UpdateTemplate request) {
        return ResponseEntity.ok(
                onboardingService.updateTemplate(orgId, principal.getUserId(), templateId, request));
    }

    @DeleteMapping("/templates/{templateId}")
    public ResponseEntity<Void> deleteTemplate(
            @PathVariable String orgId,
            @PathVariable String templateId,
            @AuthenticationPrincipal UserPrincipal principal) {
        onboardingService.deleteTemplate(orgId, principal.getUserId(), templateId);
        return ResponseEntity.noContent().build();
    }

    // ==================== Instance Endpoints ====================

    @GetMapping("/instances")
    public ResponseEntity<List<OnboardingResponse.InstanceSummary>> getInstances(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String status,
            @RequestParam(name = "member_id", required = false) String memberId) {
        OnboardingStatus statusEnum = status != null ? OnboardingStatus.valueOf(status) : null;
        return ResponseEntity.ok(
                onboardingService.getInstances(orgId, principal.getUserId(), statusEnum, memberId));
    }

    @GetMapping("/instances/{instanceId}/items")
    public ResponseEntity<List<OnboardingResponse.InstanceItemDetail>> getInstanceItems(
            @PathVariable String orgId,
            @PathVariable String instanceId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                onboardingService.getInstanceItems(orgId, principal.getUserId(), instanceId));
    }

    @PutMapping("/instances/{instanceId}/items/{itemId}/toggle")
    public ResponseEntity<OnboardingResponse.ToggleResult> toggleItem(
            @PathVariable String orgId,
            @PathVariable String instanceId,
            @PathVariable String itemId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                onboardingService.toggleItem(orgId, principal.getUserId(), instanceId, itemId));
    }

    @PostMapping("/instances")
    public ResponseEntity<OnboardingResponse.InstanceSummary> createInstance(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody OnboardingRequest.CreateInstance request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(
                onboardingService.createInstance(orgId, principal.getUserId(), request));
    }
}
