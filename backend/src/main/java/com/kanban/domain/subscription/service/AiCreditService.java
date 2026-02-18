package com.kanban.domain.subscription.service;

import com.kanban.domain.board.BoardTier;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.AiCreditPurchase;
import com.kanban.domain.subscription.AiCreditPurchaseRepository;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.subscription.dto.AiCreditRequest;
import com.kanban.domain.subscription.dto.AiCreditResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class AiCreditService {

    private final SubscriptionRepository subscriptionRepository;
    private final AiCreditPurchaseRepository aiCreditPurchaseRepository;
    private final TossPaymentsService tossPaymentsService;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final UserRepository userRepository;

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

    // === User-Level Credit Consumption (Personal features like Diary) ===

    @Transactional
    public void consumeUserCredit(String userId, String featureType, int creditCost) {
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // Initialize credits if first use (no reset date set yet)
        if (user.getPersonalCreditsResetDate() == null) {
            user.initializePersonalCredits();
        }

        if (!user.hasEnoughPersonalCredits(creditCost)) {
            throw new BusinessException(ErrorCode.PERSONAL_AI_CREDITS_EXHAUSTED);
        }

        user.consumePersonalCredits(creditCost);

        log.info("Personal AI credit consumed - user: {}, feature: {}, cost: {}, remaining: {}",
                userId, featureType, creditCost, user.getPersonalAvailableCredits());
    }

    @Transactional(readOnly = true)
    public AiCreditResponse.CreditInfo getUserCredits(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        int available = user.getPersonalAvailableCredits();
        String warningLevel = null;
        if (available <= 0) warningLevel = "EXHAUSTED";
        else if (available <= 3) warningLevel = "CRITICAL";
        else if (available <= 10) warningLevel = "LOW";

        return AiCreditResponse.CreditInfo.builder()
                .monthlyCredits(user.getPersonalAiCredits())
                .monthlyUsed(user.getPersonalCreditsUsed())
                .purchasedCredits(0)
                .totalAvailable(available)
                .resetDate(user.getPersonalCreditsResetDate())
                .warningLevel(warningLevel)
                .build();
    }

    // === User Credit Monthly Reset ===

    @Transactional(readOnly = true)
    public List<String> findUserIdsDueForPersonalCreditReset() {
        return userRepository.findUserIdsDueForPersonalCreditReset(LocalDateTime.now(ZoneOffset.UTC));
    }

    @Transactional
    public void resetSingleUserPersonalCredits(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        user.resetPersonalCredits();
    }

    // === Credit Query (Board-level) ===

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

    // === Usage History ===

    @Transactional(readOnly = true)
    public List<AiCreditResponse.UsageHistoryItem> getUsageHistory(String boardId, int days) {
        LocalDateTime since = LocalDateTime.now(ZoneOffset.UTC).minusDays(days);
        List<AiUsageLog> logs = aiUsageLogRepository
                .findByBoardIdAndCreatedAtAfterOrderByCreatedAtDesc(boardId, since);

        Set<String> userIds = logs.stream()
                .map(AiUsageLog::getUserId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, String> userNameMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getName));

        return logs.stream()
                .limit(100)
                .map(log -> AiCreditResponse.UsageHistoryItem.builder()
                        .id(log.getId())
                        .userId(log.getUserId())
                        .userName(userNameMap.getOrDefault(log.getUserId(), "Unknown"))
                        .featureType(log.getFeatureType())
                        .creditsUsed(log.getCreditsUsed())
                        .createdAt(log.getCreatedAt())
                        .build())
                .collect(Collectors.toList());
    }

    // === Monthly Reset (Called by Scheduler) ===

    @Transactional(readOnly = true)
    public List<String> findSubscriptionIdsDueForReset() {
        return subscriptionRepository.findDueForCreditReset(LocalDateTime.now(ZoneOffset.UTC))
                .stream()
                .map(Subscription::getId)
                .toList();
    }

    @Transactional
    public void resetSingleSubscriptionCredits(String subscriptionId) {
        Subscription subscription = subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));
        subscription.resetMonthlyCredits();
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
