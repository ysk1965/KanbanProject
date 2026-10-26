package com.kanban.domain.subscription.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.AiCreditPurchase;
import com.kanban.domain.subscription.AiCreditPurchaseRepository;
import com.kanban.domain.subscription.CreditConsumption;
import com.kanban.domain.subscription.OrgSubscription;
import com.kanban.domain.subscription.OrgSubscriptionRepository;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.subscription.dto.AiCreditRequest;
import com.kanban.domain.subscription.dto.AiCreditResponse;
import com.kanban.domain.system.MonetizationService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    /**
     * 크레딧 차감. 어느 풀(월간/구매)에서 얼마나 빠졌는지 돌려준다 — 실패 시 환불은 그 값을
     * {@link #refundCredit(String, String, String, CreditConsumption)} 에 그대로 넘긴다.
     *
     * @return 차감 내역. 수익화가 꺼져 있으면 {@link CreditConsumption#NONE}
     */
    @Transactional
    public CreditConsumption consumeCredit(String boardId, String userId, String featureType, int creditCost) {
        if (!monetizationService.isMonetizationEnabled()) return CreditConsumption.NONE;

        // Check if board is ORG_MANAGED → use Org credit pool
        Board board = boardRepository.findById(boardId).orElse(null);
        if (board != null && board.getTier() == BoardTier.ORG_MANAGED && board.getOrganization() != null) {
            return consumeOrgCredit(board.getOrganization().getId(), boardId, userId, featureType, creditCost);
        }

        // Board-level credit consumption (existing logic)
        Subscription subscription = subscriptionRepository
                .findByBoardIdForUpdate(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        if (!subscription.hasEnoughCredits(creditCost)) {
            throw new BusinessException(ErrorCode.AI_CREDITS_EXHAUSTED);
        }

        CreditConsumption consumed = subscription.consumeCredits(creditCost);

        log.info(
                "AI credit consumed - board: {}, user: {}, feature: {}, cost: {}, source: {}, remaining: {}",
                boardId,
                userId,
                featureType,
                creditCost,
                consumed.source(),
                subscription.getTotalAvailableCredits());
        return consumed;
    }

    /**
     * Organization 레벨 크레딧 풀에서 차감 (ORG_MANAGED 보드용)
     * Pessimistic lock으로 동시 소비 방지
     */
    @Transactional
    public CreditConsumption consumeOrgCredit(
            String orgId, String boardId, String userId, String featureType, int creditCost) {
        if (!monetizationService.isMonetizationEnabled()) return CreditConsumption.NONE;

        OrgSubscription orgSub = orgSubscriptionRepository
                .findByOrganizationIdForUpdate(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        if (!orgSub.hasEnoughCredits(creditCost)) {
            throw new BusinessException(ErrorCode.AI_CREDITS_EXHAUSTED);
        }

        CreditConsumption consumed = orgSub.consumeCredits(creditCost);

        log.info(
                "Org AI credit consumed - org: {}, board: {}, user: {}, feature: {}, cost: {}, remaining: {}",
                orgId,
                boardId,
                userId,
                featureType,
                creditCost,
                orgSub.getTotalAvailableCredits());
        return consumed;
    }

    // === Credit Refund (for async failure rollback) ===

    /**
     * {@link #consumeCredit} 가 돌려준 내역을 그대로 되돌린다 — 구매분에서 빠진 만큼은 구매분으로,
     * 월간분에서 빠진 만큼은 월간 사용량으로. 비동기 실패 롤백 경로에서 부르므로 구독/보드가 없어도 던지지 않는다.
     */
    @Transactional
    public void refundCredit(String boardId, String userId, String featureType, CreditConsumption consumption) {
        if (consumption == null || consumption.isEmpty()) return;

        Board board = boardRepository.findById(boardId).orElse(null);
        if (board != null && board.getTier() == BoardTier.ORG_MANAGED && board.getOrganization() != null) {
            OrgSubscription orgSub = orgSubscriptionRepository
                    .findByOrganizationIdForUpdate(board.getOrganization().getId())
                    .orElse(null);
            if (orgSub != null) {
                orgSub.refundCredits(consumption);
                log.info(
                        "Org AI credit refunded - org: {}, board: {}, user: {}, feature: {}, cost: {}",
                        board.getOrganization().getId(),
                        boardId,
                        userId,
                        featureType,
                        consumption.total());
            }
            return;
        }

        Subscription subscription =
                subscriptionRepository.findByBoardIdForUpdate(boardId).orElse(null);
        if (subscription != null) {
            subscription.refundCredits(consumption);
            log.info(
                    "AI credit refunded - board: {}, user: {}, feature: {}, monthly: {}, purchased: {}",
                    boardId,
                    userId,
                    featureType,
                    consumption.monthlyUsed(),
                    consumption.purchasedUsed());
        }
    }

    /**
     * 비용만 알고 환불하는 구 경로 — 월간 사용량만 되돌리고 구매분은 복원하지 못한다.
     *
     * @deprecated {@link #consumeCredit} 의 반환값을 보관했다가
     *             {@link #refundCredit(String, String, String, CreditConsumption)} 로 넘길 것.
     */
    @Deprecated
    @Transactional
    public void refundCredit(String boardId, String userId, String featureType, int creditCost) {
        log.warn(
                "Lossy credit refund (monthly only) - board: {}, feature: {}, cost: {}. Pass CreditConsumption instead.",
                boardId,
                featureType,
                creditCost);
        refundCredit(boardId, userId, featureType, CreditConsumption.monthly(creditCost));
    }

    // === User-Level Credit Consumption (Personal features) ===

    @Transactional
    public void consumeUserCredit(String userId, String featureType, int creditCost) {
        if (!monetizationService.isMonetizationEnabled()) return;

        User user = userRepository
                .findByIdForUpdate(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // Initialize credits if first use (no reset date set yet)
        if (user.getPersonalCreditsResetDate() == null) {
            user.initializePersonalCredits();
        }

        if (!user.hasEnoughPersonalCredits(creditCost)) {
            throw new BusinessException(ErrorCode.PERSONAL_AI_CREDITS_EXHAUSTED);
        }

        user.consumePersonalCredits(creditCost);

        log.info(
                "Personal AI credit consumed - user: {}, feature: {}, cost: {}, remaining: {}",
                userId,
                featureType,
                creditCost,
                user.getPersonalAvailableCredits());
    }

    /** 개인 크레딧 환불 — AI 호출·파싱이 실패했을 때. 월간 사용량을 먼저 되돌리고, 그래도 남으면 구매분으로 */
    @Transactional
    public void refundUserCredit(String userId, String featureType, int amount) {
        if (!monetizationService.isMonetizationEnabled() || amount <= 0) return;

        User user = userRepository
                .findByIdForUpdate(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        user.refundPersonalCredits(amount);
        log.info("Personal AI credit refunded - user: {}, feature: {}, amount: {}", userId, featureType, amount);
    }

    @Transactional(readOnly = true)
    public AiCreditResponse.CreditInfo getUserCredits(String userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        int available = user.getPersonalAvailableCredits();
        String warningLevel = null;
        if (available <= 0) warningLevel = "EXHAUSTED";
        else if (available <= 3) warningLevel = "CRITICAL";
        else if (available <= 10) warningLevel = "LOW";

        return AiCreditResponse.CreditInfo.builder()
                .monthlyCredits(user.getPersonalAiCredits())
                .monthlyUsed(user.getPersonalCreditsUsed())
                .purchasedCredits(user.getPersonalPurchasedCredits() != null ? user.getPersonalPurchasedCredits() : 0)
                .rewardCredits(user.getActivePersonalRewardCredits())
                .rewardExpiresAt(user.getActivePersonalRewardCredits() > 0 ? user.getPersonalRewardExpiresAt() : null)
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
            User user = userRepository
                    .findByIdForUpdate(userId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
            user.addPersonalPurchasedCredits(creditAmount);

            // 3. Save purchase history
            AiCreditPurchase purchase = AiCreditPurchase.builder()
                    .boardId(null) // personal purchase, no board
                    .userId(userId)
                    .creditAmount(creditAmount)
                    .unitPrice(10)
                    .totalAmount(request.getAmount())
                    .paymentKey(request.getPaymentKey())
                    .orderId(request.getOrderId())
                    .status("COMPLETED")
                    .build();
            aiCreditPurchaseRepository.save(purchase);

            log.info(
                    "Personal AI credits purchased - user: {}, credits: {}, amount: {}",
                    userId,
                    creditAmount,
                    request.getAmount());

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
        User user = userRepository.findById(userId).orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
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

        Subscription subscription = subscriptionRepository
                .findByBoardId(boardId)
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

    /**
     * 이미 로드된 엔티티를 재사용하는 오버로드 (BoardFacadeService용 — Board/Subscription 재조회 생략).
     * getCredits(boardId)와 동일한 분기/응답: ORG_MANAGED 보드는 조직 크레딧 풀,
     * 그 외에는 보드 구독 크레딧을 반환하고, 구독이 없으면 SUBSCRIPTION_NOT_FOUND를 던진다.
     */
    @Transactional(readOnly = true)
    public AiCreditResponse.CreditInfo getCredits(Board board, Subscription subscription) {
        if (board != null && board.getTier() == BoardTier.ORG_MANAGED && board.getOrganization() != null) {
            return getOrgCredits(board.getOrganization().getId());
        }

        if (subscription == null) {
            throw new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND);
        }

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
        OrgSubscription orgSub = orgSubscriptionRepository
                .findByOrganizationId(orgId)
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
    public AiCreditResponse.PurchaseResult purchaseCredits(
            String boardId, String userId, AiCreditRequest.Purchase request) {
        // 1. Validate amount (100 credit units, 10 KRW per credit)
        int creditAmount = request.getCreditAmount();
        if (creditAmount < 100 || creditAmount % 100 != 0) {
            throw new BusinessException(ErrorCode.AI_CREDIT_PURCHASE_AMOUNT_INVALID);
        }

        int expectedAmount = creditAmount * 10; // 100 credits = 1,000 KRW -> 10 KRW per credit
        if (!request.getAmount().equals(expectedAmount)) {
            throw new BusinessException(ErrorCode.AI_CREDIT_PURCHASE_AMOUNT_INVALID);
        }

        try {
            // 2. Add credits with pessimistic lock (payment confirmed via Polar webhook)
            Subscription subscription = subscriptionRepository
                    .findByBoardIdForUpdate(boardId)
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

            log.info(
                    "AI credits purchased - board: {}, user: {}, credits: {}, amount: {}",
                    boardId,
                    userId,
                    creditAmount,
                    request.getAmount());

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
        return aiCreditPurchaseRepository.findByBoardIdOrderByCreatedAtDesc(boardId).stream()
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
        List<AiUsageLog> logs = aiUsageLogRepository.findByBoardIdAndCreatedAtAfterOrderByCreatedAtDesc(boardId, since);

        Set<String> userIds = logs.stream()
                .map(AiUsageLog::getUserId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, String> userNameMap =
                userRepository.findAllById(userIds).stream().collect(Collectors.toMap(User::getId, User::getName));

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
        return subscriptionRepository.findDueForCreditReset(LocalDateTime.now(ZoneOffset.UTC)).stream()
                .map(Subscription::getId)
                .toList();
    }

    @Transactional
    public void resetSingleSubscriptionCredits(String subscriptionId) {
        Subscription subscription = subscriptionRepository
                .findById(subscriptionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));
        subscription.resetMonthlyCredits();
    }

    // === Org Credit Monthly Reset ===

    @Transactional(readOnly = true)
    public List<String> findOrgSubscriptionIdsDueForReset() {
        return orgSubscriptionRepository.findDueForCreditReset(LocalDateTime.now(ZoneOffset.UTC)).stream()
                .map(OrgSubscription::getId)
                .toList();
    }

    @Transactional
    public void resetSingleOrgSubscriptionCredits(String orgSubscriptionId) {
        OrgSubscription orgSub = orgSubscriptionRepository
                .findById(orgSubscriptionId)
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
