package com.kanban.domain.subscription.controller;

import com.kanban.domain.subscription.dto.CheckoutResponse;
import com.kanban.domain.subscription.dto.PolarCheckoutRequest;
import com.kanban.domain.subscription.dto.SubscriptionRequest;
import com.kanban.domain.subscription.dto.SubscriptionResponse;
import com.kanban.domain.subscription.service.SubscriptionService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
public class SubscriptionController {

    private final SubscriptionService subscriptionService;

    // 공개 API - 가격 정책 조회
    @GetMapping("/api/v1/pricing")
    public ResponseEntity<SubscriptionResponse.PricingListResponse> getPricingPlans() {
        SubscriptionResponse.PricingListResponse response = subscriptionService.getPricingPlans();
        return ResponseEntity.ok(response);
    }

    // Board 구독 관리 API
    @GetMapping("/api/v1/boards/{boardId}/subscription")
    public ResponseEntity<SubscriptionResponse.Detail> getSubscription(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        SubscriptionResponse.Detail response = subscriptionService.getSubscription(boardId, principal.getUserId());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/api/v1/boards/{boardId}/subscription/start")
    public ResponseEntity<SubscriptionResponse.Detail> startSubscription(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody SubscriptionRequest.Start request) {
        SubscriptionResponse.Detail response = subscriptionService.startSubscription(boardId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/api/v1/boards/{boardId}/subscription/plan")
    public ResponseEntity<SubscriptionResponse.Detail> changePlan(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody SubscriptionRequest.ChangePlan request) {
        SubscriptionResponse.Detail response = subscriptionService.changePlan(boardId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/api/v1/boards/{boardId}/subscription/seats")
    public ResponseEntity<SubscriptionResponse.Detail> purchaseSeats(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody SubscriptionRequest.PurchaseSeats request) {
        SubscriptionResponse.Detail response = subscriptionService.purchaseSeats(
                boardId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    // Polar Checkout - Board Subscription
    @PostMapping("/api/v1/checkout/board-subscription")
    public ResponseEntity<CheckoutResponse> checkoutBoardSubscription(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody PolarCheckoutRequest.BoardSubscriptionCheckout request) {
        CheckoutResponse response = subscriptionService.createBoardSubscriptionCheckout(
                request.getBoardId(), request.getBillingCycle(), request.getSeatCount(), principal.getUserId());
        return ResponseEntity.ok(response);
    }

    // Polar Checkout - AI Credits
    @PostMapping("/api/v1/checkout/ai-credits")
    public ResponseEntity<CheckoutResponse> checkoutAiCredits(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody PolarCheckoutRequest.AiCreditCheckout request) {
        CheckoutResponse response = subscriptionService.createAiCreditCheckout(
                request.getBoardId(), request.getCreditAmount(), principal.getUserId());
        return ResponseEntity.ok(response);
    }

    // Polar Checkout - Additional Seats
    @PostMapping("/api/v1/checkout/seats")
    public ResponseEntity<CheckoutResponse> checkoutSeats(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody PolarCheckoutRequest.SeatCheckout request) {
        CheckoutResponse response = subscriptionService.createSeatCheckout(
                request.getBoardId(), request.getAdditionalSeats(), principal.getUserId());
        return ResponseEntity.ok(response);
    }

    // Billing Portal - Polar Customer Portal redirect
    @GetMapping("/api/v1/boards/{boardId}/subscription/billing-portal")
    public ResponseEntity<Map<String, String>> getBillingPortalUrl(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        String portalUrl = subscriptionService.getBillingPortalUrl(boardId, principal.getUserId());
        return ResponseEntity.ok(Map.of("url", portalUrl));
    }

    @DeleteMapping("/api/v1/boards/{boardId}/subscription")
    public ResponseEntity<Map<String, String>> cancelSubscription(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        subscriptionService.cancelSubscription(boardId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "구독이 취소되었습니다"));
    }

    @PostMapping("/api/v1/boards/{boardId}/subscription/undo-cancel")
    public ResponseEntity<Map<String, String>> undoCancellation(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        subscriptionService.undoCancellation(boardId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "구독 취소가 철회되었습니다"));
    }
}
