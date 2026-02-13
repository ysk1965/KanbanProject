package com.kanban.domain.subscription.service;

import com.kanban.domain.board.BoardTier;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.AiCreditPurchase;
import com.kanban.domain.subscription.AiCreditPurchaseRepository;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.subscription.dto.AiCreditRequest;
import com.kanban.domain.subscription.dto.AiCreditResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class AiCreditService {

    private final SubscriptionRepository subscriptionRepository;
    private final AiCreditPurchaseRepository aiCreditPurchaseRepository;
    private final TossPaymentsService tossPaymentsService;
    private final AiUsageLogRepository aiUsageLogRepository;

    // === Credit Consumption (Core - Uses Pessimistic Lock) ===

    @Transactional
    public void consumeCredit(String boardId, String userId, String featureType, int creditCost) {
        // 1. Pessimistic lock on subscription
        Subscription subscription = subscriptionRepository.findByBoardIdForUpdate(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        // 2. Check sufficient credits
        if (!subscription.hasEnoughCredits(creditCost)) {
            throw new BusinessException(ErrorCode.AI_CREDITS_EXHAUSTED);
        }

        // 3. Determine consumption source (for logging)
        String creditSource = subscription.getCreditSource(creditCost);

        // 4. Consume credits
        subscription.consumeCredits(creditCost);

        // 5. Log usage
        log.info("AI credit consumed - board: {}, user: {}, feature: {}, cost: {}, source: {}, remaining: {}",
                boardId, userId, featureType, creditCost, creditSource, subscription.getTotalAvailableCredits());
    }

    // === Credit Query ===

    @Transactional(readOnly = true)
    public AiCreditResponse.CreditInfo getCredits(String boardId) {
        Subscription subscription = subscriptionRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        return AiCreditResponse.CreditInfo.builder()
                .monthlyCredits(subscription.getMonthlyAiCredits())
                .monthlyUsed(subscription.getMonthlyCreditsUsed())
                .purchasedCredits(subscription.getPurchasedCredits())
                .totalAvailable(subscription.getTotalAvailableCredits())
                .resetDate(subscription.getCreditsResetDate())
                .warningLevel(subscription.getWarningLevel())
                .build();
    }

    // === Credit Purchase ===

    @Transactional
    public AiCreditResponse.PurchaseResult purchaseCredits(String boardId, String userId, AiCreditRequest.Purchase request) {
        // 1. Validate amount (100 credit units, 10 KRW per credit)
        int creditAmount = request.getCreditAmount();
        if (creditAmount < 100 || creditAmount % 100 != 0) {
            throw new BusinessException(ErrorCode.AI_CREDIT_PURCHASE_AMOUNT_INVALID);
        }

        int expectedAmount = creditAmount * 10;  // 100 credits = 1,000 KRW -> 10 KRW per credit
        if (!request.getAmount().equals(expectedAmount)) {
            throw new BusinessException(ErrorCode.AI_CREDIT_PURCHASE_AMOUNT_INVALID);
        }

        try {
            // 2. Confirm Toss Payments (if paymentKey is provided)
            if (request.getPaymentKey() != null) {
                tossPaymentsService.confirmPayment(request.getPaymentKey(), request.getOrderId(), request.getAmount());
            }

            // 3. Add credits with pessimistic lock
            Subscription subscription = subscriptionRepository.findByBoardIdForUpdate(boardId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));
            subscription.addPurchasedCredits(creditAmount);

            // 4. Save purchase history
            AiCreditPurchase purchase = AiCreditPurchase.builder()
                    .boardId(boardId)
                    .userId(userId)
                    .creditAmount(creditAmount)
                    .unitPrice(10)
                    .totalAmount(request.getAmount())
                    .paymentKey(request.getPaymentKey())
                    .orderId(request.getOrderId())
                    .status("COMPLETED")
                    .build();
            aiCreditPurchaseRepository.save(purchase);

            log.info("AI credits purchased - board: {}, user: {}, credits: {}, amount: {}",
                    boardId, userId, creditAmount, request.getAmount());

            // 5. Return result
            return AiCreditResponse.PurchaseResult.builder()
                    .purchaseId(purchase.getId())
                    .creditAmount(creditAmount)
                    .totalAmount(request.getAmount())
                    .updatedCredits(getCredits(boardId))
                    .build();
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Credit purchase failed - board: {}, error: {}", boardId, e.getMessage(), e);
            throw new BusinessException(ErrorCode.AI_CREDIT_PURCHASE_FAILED);
        }
    }

    // === Purchase History ===

    @Transactional(readOnly = true)
    public List<AiCreditResponse.PurchaseHistory> getPurchaseHistory(String boardId) {
        return aiCreditPurchaseRepository.findByBoardIdOrderByCreatedAtDesc(boardId)
                .stream()
                .map(p -> AiCreditResponse.PurchaseHistory.builder()
                        .id(p.getId())
                        .creditAmount(p.getCreditAmount())
                        .totalAmount(p.getTotalAmount())
                        .status(p.getStatus())
                        .createdAt(p.getCreatedAt())
                        .build())
                .collect(Collectors.toList());
    }

    // === Monthly Reset (Called by Scheduler) ===

    @Transactional
    public void resetMonthlyCredits() {
        List<Subscription> dueForReset = subscriptionRepository.findDueForCreditReset(
                LocalDateTime.now(ZoneOffset.UTC));

        for (Subscription subscription : dueForReset) {
            subscription.resetMonthlyCredits();
        }

        if (!dueForReset.isEmpty()) {
            log.info("Monthly AI credits reset for {} subscriptions", dueForReset.size());
        }
    }

    // === Tier-Based Monthly Credit Allocation ===

    public static int getMonthlyCreditsForTier(BoardTier tier, int seatCount) {
        return switch (tier) {
            case TRIAL -> 100;
            case STANDARD -> 30;
            case PREMIUM -> 200 + (seatCount * 50);
        };
    }
}
