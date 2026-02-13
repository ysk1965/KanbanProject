package com.kanban.domain.subscription.controller;

import com.kanban.domain.subscription.dto.AiCreditRequest;
import com.kanban.domain.subscription.dto.AiCreditResponse;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/ai-credits")
@RequiredArgsConstructor
@Slf4j
public class AiCreditController {

    private final AiCreditService aiCreditService;

    // Credit query
    @GetMapping
    public ResponseEntity<AiCreditResponse.CreditInfo> getCredits(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        return ResponseEntity.ok(aiCreditService.getCredits(boardId));
    }

    // Credit purchase
    @PostMapping("/purchase")
    public ResponseEntity<AiCreditResponse.PurchaseResult> purchaseCredits(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            @Valid @RequestBody AiCreditRequest.Purchase request) {
        return ResponseEntity.ok(
                aiCreditService.purchaseCredits(boardId, userPrincipal.getUserId(), request));
    }

    // Purchase history query
    @GetMapping("/purchases")
    public ResponseEntity<List<AiCreditResponse.PurchaseHistory>> getPurchaseHistory(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        return ResponseEntity.ok(aiCreditService.getPurchaseHistory(boardId));
    }
}
