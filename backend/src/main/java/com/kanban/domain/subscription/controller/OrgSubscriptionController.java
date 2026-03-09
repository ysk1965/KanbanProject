package com.kanban.domain.subscription.controller;

import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.subscription.BillingCycle;
import com.kanban.domain.subscription.OrgPaymentHistory;
import com.kanban.domain.subscription.OrgSubscription;
import com.kanban.domain.subscription.dto.CheckoutResponse;
import com.kanban.domain.subscription.dto.MigrationPreviewResponse;
import com.kanban.domain.subscription.dto.OrgSubscriptionResponse;
import com.kanban.domain.subscription.dto.PolarCheckoutRequest;
import com.kanban.domain.subscription.service.OrgSubscriptionService;
import com.kanban.domain.organization.service.OrganizationService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class OrgSubscriptionController {

    private final OrgSubscriptionService orgSubscriptionService;
    private final OrganizationService organizationService;
    private final BoardRepository boardRepository;

    // === Request DTOs ===

    public record ActivateRequest(BillingCycle billingCycle, int seatCount, String paymentMethodId) {}
    public record MigratePreviewRequest(BillingCycle billingCycle, List<String> boardIds) {}
    public record MigrateRequest(BillingCycle billingCycle, List<String> boardIds, String paymentMethodId) {}
    public record PurchaseSeatsRequest(int additionalSeats) {}

    // === Endpoints ===

    @GetMapping("/api/v1/organizations/{orgId}/subscription")
    public ResponseEntity<OrgSubscriptionResponse> getSubscription(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        organizationService.getOrgMemberOrThrow(orgId, principal.getUserId());
        OrgSubscription sub = orgSubscriptionService.getSubscription(orgId);
        int boardCount = boardRepository.countByOrganizationId(orgId);
        return ResponseEntity.ok(OrgSubscriptionResponse.from(sub, boardCount));
    }

    @PostMapping("/api/v1/organizations/{orgId}/subscription/activate")
    public ResponseEntity<OrgSubscriptionResponse> activateTeam(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody ActivateRequest request) {
        organizationService.checkAdminOrAbove(orgId, principal.getUserId());
        OrgSubscription sub = orgSubscriptionService.activateTeam(
            orgId, request.billingCycle(), request.seatCount(), request.paymentMethodId());
        int boardCount = boardRepository.countByOrganizationId(orgId);
        return ResponseEntity.ok(OrgSubscriptionResponse.from(sub, boardCount));
    }

    @PostMapping("/api/v1/organizations/{orgId}/subscription/migrate/preview")
    public ResponseEntity<MigrationPreviewResponse> previewMigration(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody MigratePreviewRequest request) {
        organizationService.checkAdminOrAbove(orgId, principal.getUserId());
        MigrationPreviewResponse preview = orgSubscriptionService.previewMigration(
            orgId, request.billingCycle(), request.boardIds());
        return ResponseEntity.ok(preview);
    }

    @PostMapping("/api/v1/organizations/{orgId}/subscription/migrate")
    public ResponseEntity<OrgSubscriptionResponse> migrate(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody MigrateRequest request) {
        organizationService.checkAdminOrAbove(orgId, principal.getUserId());
        OrgSubscription sub = orgSubscriptionService.migrateFromBoardSubscriptions(
            orgId, request.billingCycle(), request.boardIds(), request.paymentMethodId());
        int boardCount = boardRepository.countByOrganizationId(orgId);
        return ResponseEntity.ok(OrgSubscriptionResponse.from(sub, boardCount));
    }

    @PostMapping("/api/v1/organizations/{orgId}/subscription/downgrade")
    public ResponseEntity<OrgSubscriptionResponse> downgrade(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        organizationService.checkAdminOrAbove(orgId, principal.getUserId());
        orgSubscriptionService.downgradeToFree(orgId);
        OrgSubscription sub = orgSubscriptionService.getSubscription(orgId);
        int boardCount = boardRepository.countByOrganizationId(orgId);
        return ResponseEntity.ok(OrgSubscriptionResponse.from(sub, boardCount));
    }

    @PostMapping("/api/v1/organizations/{orgId}/subscription/seats")
    public ResponseEntity<OrgSubscriptionResponse> purchaseSeats(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody PurchaseSeatsRequest request) {
        organizationService.checkAdminOrAbove(orgId, principal.getUserId());
        OrgSubscription sub = orgSubscriptionService.purchaseAdditionalSeats(orgId, request.additionalSeats());
        int boardCount = boardRepository.countByOrganizationId(orgId);
        return ResponseEntity.ok(OrgSubscriptionResponse.from(sub, boardCount));
    }

    @DeleteMapping("/api/v1/organizations/{orgId}/subscription")
    public ResponseEntity<Map<String, String>> cancel(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        organizationService.checkAdminOrAbove(orgId, principal.getUserId());
        orgSubscriptionService.cancel(orgId);
        return ResponseEntity.ok(Map.of("message", "Organization subscription canceled"));
    }

    @PostMapping("/api/v1/organizations/{orgId}/subscription/undo-cancel")
    public ResponseEntity<Map<String, String>> undoCancellation(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        organizationService.checkAdminOrAbove(orgId, principal.getUserId());
        orgSubscriptionService.undoCancellation(orgId);
        return ResponseEntity.ok(Map.of("message", "Organization subscription cancellation undone"));
    }

    @GetMapping("/api/v1/organizations/{orgId}/subscription/payments")
    public ResponseEntity<List<OrgPaymentHistory>> getPaymentHistory(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        organizationService.getOrgMemberOrThrow(orgId, principal.getUserId());
        List<OrgPaymentHistory> history = orgSubscriptionService.getPaymentHistory(orgId);
        return ResponseEntity.ok(history);
    }

    // Polar Checkout - Organization Subscription
    @PostMapping("/api/v1/checkout/org-subscription")
    public ResponseEntity<CheckoutResponse> checkoutOrgSubscription(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody PolarCheckoutRequest.OrgSubscriptionCheckout request) {
        organizationService.checkAdminOrAbove(request.getOrgId(), principal.getUserId());
        CheckoutResponse response = orgSubscriptionService.createOrgSubscriptionCheckout(
                request.getOrgId(), request.getBillingCycle(), request.getSeatCount(), principal.getUserId());
        return ResponseEntity.ok(response);
    }
}
