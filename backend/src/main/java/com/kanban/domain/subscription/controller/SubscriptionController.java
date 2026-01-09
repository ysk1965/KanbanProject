package com.kanban.domain.subscription.controller;

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

    @DeleteMapping("/api/v1/boards/{boardId}/subscription")
    public ResponseEntity<Map<String, String>> cancelSubscription(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        subscriptionService.cancelSubscription(boardId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "구독이 취소되었습니다"));
    }
}
