package com.kanban.domain.subscription.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.system.MonetizationService;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.AiCreditPurchase;
import com.kanban.domain.subscription.AiCreditPurchaseRepository;
import com.kanban.domain.subscription.OrgSubscription;
import com.kanban.domain.subscription.OrgSubscriptionRepository;
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
    private final OrgSubscriptionRepository orgSubscriptionRepository;
    private final BoardRepository boardRepository;
    private final AiCreditPurchaseRepository aiCreditPurchaseRepository;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final UserRepository userRepository;
    private final MonetizationService monetizationService;

    // === Credit Consumption (Core - Uses Pessimistic Lock) ===

    @Transactional
    public void consumeCredit(String boardId, String userId, String featureType, int creditCost) {
        if (!monetizationService.isMonetizationEnabled()) return;

        // Check if board is ORG_MANAGED → use Org credit pool
        Board board = boardRepository.findById(boardId).orElse(null);
        if (board != null && board.getTier() == BoardTier.ORG_MANAGED && board.getOrganization() != null) {
            consumeOrgCredit(board.getOrganization().getId(), boardId, userId, featureType, creditCost);
            return;
        }

        // Board-level credit consumption (existing logic)
        Subscription subscription = subscriptionRepository.findByBoardIdForUpdate(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        if (!subscription.hasEnoughCredits(creditCost)) {
            throw new BusinessException(ErrorCode.AI_CREDITS_EXHAUSTED);
        }

        String creditSource = subscription.getCreditSource(creditCost);
        subscription.consumeCredits(creditCost);

        log.info("AI credit consumed - board: {}, user: {}, feature: {}, cost: {}, source: {}, remaining: {}",
                boardId, userId, featureType, creditCost, creditSource, subscription.getTotalAvailableCredits());
    }

    /**
     * Organization 레벨 크레딧 풀에서 차감 (ORG_MANAGED 보드용)
     * Pessimistic lock으로 동시 소비 방지
     */
    @Transactional
    public void consumeOrgCredit(String orgId, String boardId, String userId, String featureType, int creditCost) {
        if (!monetizationService.isMonetizationEnabled()) return;

        OrgSubscription orgSub = orgSubscriptionRepository.findByOrganizationIdForUpdate(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        if (!orgSub.hasEnoughCredits(creditCost)) {
            throw new BusinessException(ErrorCode.AI_CREDITS_EXHAUSTED);
        }

        orgSub.consumeCredits(creditCost);

        log.info("Org AI credit consumed - org: {}, board: {}, user: {}, feature: {}, cost: {}, remaining: {}",
                orgId, boardId, userId, featureType, creditCost, orgSub.getTotalAvailableCredits());
    }

    // === Credit Refund (for async failure rollback) ===

    @Transactional
    public void refundCredit(String boardId, String userId, String featureType, int creditCost) {
        Board board = boardRepository.findById(boardId).orElse(null);
        if (board != null && board.getTier() == BoardTier.ORG_MANAGED && board.getOrganization() != null) {
            OrgSubscription orgSub = orgSubscriptionRepository.findByOrganizationIdForUpdate(board.getOrganization().getId())
                    .orElse(null);
            if (orgSub != null) {
                orgSub.refundCredits(creditCost);
                log.info("Org AI credit refunded - org: {}, board: {}, user: {}, feature: {}, cost: {}",
                        board.getOrganization().getId(), boardId, userId, featureType, creditCost);
            }
            return;
        }

        Subscription subscription = subscriptionRepository.findByBoardIdForUpdate(boardId).orElse(null);
        if (subscription != null) {
            subscription.refundCredits(creditCost);
            log.info("AI credit refunded - board: {}, user: {}, feature: {}, cost: {}",
                    boardId, userId, featureType, creditCost);
        }
    }

    // === User-Level Credit Consumption (Personal features like Diary) ===

    @Transactional
    public void consumeUserCredit(String userId, String featureType, int creditCost) {
        if (!monetizationService.isMonetizationEnabled()) return;

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
                .purchasedCredits(user.getPersonalPurchasedCredits() != null ? user.getPersonalPurchasedCredits() : 0)
                .totalAvailable(available)
                .resetDate(user.getPersonalCreditsResetDate())
                .warningLevel(warningLevel)
                .build();
    }

    // === User-Level Credit Purchase (Personal) ===

    @Transactional
    public AiCreditResponse.PurchaseResult purchasePersonalCredits(String userId, AiCreditRequest.Purchase request) {
        // 1. Validate amount (100 credit units, 10 KRW per credit)
        int creditAmount = request.getCreditAmount();
        if (creditAmount < 100 || creditAmount % 100 != 0) {
            throw new BusinessException(ErrorCode.AI_CREDIT_PURCHASE_AMOUNT_INVALID);
        }

        int expectedAmount = creditAmount * 10;
        if (!request.getAmount().equals(expectedAmount)) {
            throw new BusinessException(ErrorCode.AI_CREDIT_PURCHASE_AMOUNT_INVALID);
        }

        try {
            // 2. Add credits with pessimistic lock (payment confirmed via Polar webhook)
            User user = userRepository.findByIdForUpdate(userId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
            user.addPersonalPurchasedCredits(creditAmount);

            // 3. Save purchase history
            AiCreditPurchase purchase = AiCreditPurchase.builder()
                    .boardId(null)  // personal purchase, no board
                    .userId(userId)
                    .creditAmount(creditAmount)
                    .unitPrice(10)
                    .totalAmount(request.getAmount())
                    .paymentKey(request.getPaymentKey())
                    .orderId(request.getOrderId())
                    .status("COMPLETED")
                    .build();
            aiCreditPurchaseRepository.save(purchase);

            log.info("Personal AI credits purchased - user: {}, credits: {}, amount: {}",
                    userId, creditAmount, request.getAmount());

            // 4. Return result
            return AiCreditResponse.PurchaseResult.builder()
                    .purchaseId(purchase.getId())
                    .creditAmount(creditAmount)
                    .totalAmount(request.getAmount())
                    .updatedCredits(getUserCredits(userId))
                    .build();
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Personal credit purchase failed - user: {}, error: {}", userId, e.getMessage(), e);
            throw new BusinessException(ErrorCode.AI_CREDIT_PURCHASE_FAILED);
        }
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
        // Check if board is ORG_MANAGED → return Org credit pool info
        Board board = boardRepository.findById(boardId).orElse(null);
        if (board != null && board.getTier() == BoardTier.ORG_MANAGED && board.getOrganization() != null) {
            return getOrgCredits(board.getOrganization().getId());
        }

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

    @Transactional(readOnly = true)
    public AiCreditResponse.CreditInfo getOrgCredits(String orgId) {
        OrgSubscription orgSub = orgSubscriptionRepository.findByOrganizationId(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        return AiCreditResponse.CreditInfo.builder()
                .monthlyCredits(orgSub.getMonthlyAiCredits() != null ? orgSub.getMonthlyAiCredits() : 0)
                .monthlyUsed(orgSub.getMonthlyCreditsUsed() != null ? orgSub.getMonthlyCreditsUsed() : 0)
                .purchasedCredits(0)
                .totalAvailable(orgSub.getTotalAvailableCredits())
                .resetDate(orgSub.getCreditsResetDate())
                .warningLevel(orgSub.getWarningLevel())
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
            // 2. Add credits with pessimistic lock (payment confirmed via Polar webhook)
            Subscription subscription = subscriptionRepository.findByBoardIdForUpdate(boardId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));
            subscription.addPurchasedCredits(creditAmount);

            // 3. Save purchase history
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

            // 4. Return result
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

    // === Org Credit Monthly Reset ===

    @Transactional(readOnly = true)
    public List<String> findOrgSubscriptionIdsDueForReset() {
        return orgSubscriptionRepository.findDueForCreditReset(LocalDateTime.now(ZoneOffset.UTC))
                .stream()
                .map(OrgSubscription::getId)
                .toList();
    }

    @Transactional
    public void resetSingleOrgSubscriptionCredits(String orgSubscriptionId) {
        OrgSubscription orgSub = orgSubscriptionRepository.findById(orgSubscriptionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));
        orgSub.resetMonthlyCredits();
    }

    // === Tier-Based Monthly Credit Allocation ===

    public static int getMonthlyCreditsForTier(BoardTier tier, int seatCount) {
        return switch (tier) {
            case TRIAL -> 100;
            case STANDARD -> 30;
            case PREMIUM, ORG_MANAGED -> 200 + (seatCount * 50);
        };
    }
}
