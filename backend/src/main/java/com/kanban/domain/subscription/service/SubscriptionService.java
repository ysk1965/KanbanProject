package com.kanban.domain.subscription.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.subscription.*;
import com.kanban.domain.subscription.config.PolarConfig;
import com.kanban.domain.subscription.dto.CheckoutResponse;
import com.kanban.domain.subscription.dto.SubscriptionRequest;
import com.kanban.domain.subscription.dto.SubscriptionResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.WebSocketAuthInterceptor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SubscriptionService {

    private final SubscriptionRepository subscriptionRepository;
    private final PricingPlanRepository pricingPlanRepository;
    private final PaymentHistoryRepository paymentHistoryRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final BoardRepository boardRepository;
    private final BoardService boardService;
    private final PolarApiClient polarApiClient;
    private final PolarConfig polarConfig;
    private final WebSocketAuthInterceptor webSocketAuthInterceptor;

    @Value("${app.frontend-url:https://bridgespots.com}")
    private String frontendUrl;

    public SubscriptionResponse.PricingListResponse getPricingPlans() {
        List<PricingPlan> plans = pricingPlanRepository.findByIsActiveTrueOrderByMinMembersAsc();
        return SubscriptionResponse.PricingListResponse.of(plans);
    }

    public SubscriptionResponse.Detail getSubscription(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        Subscription subscription = subscriptionRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        // 현재 billable 멤버 수 업데이트
        int currentBillable = boardMemberRepository.countBillableMembers(boardId);
        subscription.updateBillableMemberCount(currentBillable);

        return SubscriptionResponse.Detail.of(subscription);
    }

    @Transactional
    public SubscriptionResponse.Detail startSubscription(String boardId, String userId, SubscriptionRequest.Start request) {
        boardService.checkOwner(boardId, userId);

        Subscription subscription = subscriptionRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        // Seat 기반: 프론트에서 선택한 시트 수 사용, 최소 현재 멤버 수 보장
        int currentBillable = boardMemberRepository.countBillableMembers(boardId);
        int seatCount = request.getSeatCount() != null
                ? Math.max(request.getSeatCount(), currentBillable)
                : Math.max(currentBillable, 1);

        subscription.activateSeatSubscription(
                request.getBillingCycle(),
                seatCount,
                request.getPaymentMethodId()
        );
        subscription.updateBillableMemberCount(currentBillable);

        // Board tier를 PREMIUM으로 전환
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        board.upgradeToPremium();
        webSocketAuthInterceptor.evictTierCache(boardId);

        // Initialize AI credits for the new tier
        int monthlyCredits = AiCreditService.getMonthlyCreditsForTier(BoardTier.PREMIUM, seatCount);
        subscription.initializeCredits(monthlyCredits);

        // Mock 결제 이력 생성
        createMockPayment(subscription, subscription.getPrice(), seatCount);

        log.info("Seat subscription started for board: {} by user: {}. Seats: {}, Cycle: {}",
                boardId, userId, seatCount, request.getBillingCycle());

        return SubscriptionResponse.Detail.of(subscription);
    }

    @Transactional
    public SubscriptionResponse.Detail purchaseSeats(String boardId, String userId, SubscriptionRequest.PurchaseSeats request) {
        boardService.checkOwner(boardId, userId);

        Subscription subscription = subscriptionRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        if (!subscription.isActive()) {
            throw new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND);
        }

        int additionalSeats = request.getAdditionalSeats();
        int newSeatCount = subscription.getSeatCount() + additionalSeats;
        int additionalAmount = additionalSeats * subscription.getPricePerSeat();

        subscription.updateSeatCount(newSeatCount);

        int currentBillable = boardMemberRepository.countBillableMembers(boardId);
        subscription.updateBillableMemberCount(currentBillable);

        // Mock 결제 이력 생성
        createMockPayment(subscription, additionalAmount, newSeatCount);

        log.info("Seats purchased for board: {} by user: {}. Additional: {}, New total: {}, Amount: {}",
                boardId, userId, additionalSeats, newSeatCount, additionalAmount);

        return SubscriptionResponse.Detail.of(subscription);
    }

    @Transactional
    public SubscriptionResponse.Detail changePlan(String boardId, String userId, SubscriptionRequest.ChangePlan request) {
        boardService.checkOwner(boardId, userId);

        Subscription subscription = subscriptionRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        if (!subscription.isActive()) {
            throw new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND);
        }

        // 빌링 사이클 변경 + 가격 재계산
        BillingCycle newCycle = request.getBillingCycle();
        int newPricePerSeat = newCycle == BillingCycle.YEARLY
                ? Subscription.YEARLY_PRICE_PER_SEAT
                : Subscription.MONTHLY_PRICE_PER_SEAT;
        int newTotalPrice = newPricePerSeat * subscription.getSeatCount();

        subscription.updatePlan("PREMIUM", newCycle, newTotalPrice);

        log.info("Subscription billing cycle changed for board: {} to {} by user: {}",
                boardId, newCycle, userId);

        return SubscriptionResponse.Detail.of(subscription);
    }

    @Transactional
    public void cancelSubscription(String boardId, String userId) {
        boardService.checkOwner(boardId, userId);

        Subscription subscription = subscriptionRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        // Grace period: 취소 예약만 하고, currentPeriodEnd까지 Premium 유지
        subscription.requestCancellation();

        log.info("Subscription cancellation requested for board: {} by user: {}. Active until: {}",
                boardId, userId, subscription.getCurrentPeriodEnd());
    }

    @Transactional
    public void undoCancellation(String boardId, String userId) {
        boardService.checkOwner(boardId, userId);

        Subscription subscription = subscriptionRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        if (!subscription.isCancellationRequested()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        subscription.undoCancellation();
        log.info("Subscription cancellation undone for board: {} by user: {}", boardId, userId);
    }

    /**
     * Polar Customer Portal URL 반환 (결제 수단 관리)
     */
    public String getBillingPortalUrl(String boardId, String userId) {
        boardService.checkOwner(boardId, userId);

        subscriptionRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        // Polar customer portal URL
        String baseUrl = polarConfig.getBaseUrl() != null
                ? polarConfig.getBaseUrl()
                : "https://polar.sh";
        return baseUrl + "/" + polarConfig.getOrganizationId() + "/portal";
    }

    // === Polar Checkout Methods ===

    public CheckoutResponse createBoardSubscriptionCheckout(String boardId, BillingCycle billingCycle, int seatCount, String userId) {
        boardService.checkOwner(boardId, userId);

        String productId = billingCycle == BillingCycle.YEARLY
                ? polarConfig.getProducts().getBoardYearly()
                : polarConfig.getProducts().getBoardMonthly();

        Map<String, String> metadata = new HashMap<>();
        metadata.put("bridge_type", "board_subscription");
        metadata.put("board_id", boardId);
        metadata.put("user_id", userId);
        metadata.put("billing_cycle", billingCycle.name());
        metadata.put("seat_count", String.valueOf(seatCount));

        String successUrl = frontendUrl + "/boards/" + boardId + "?checkout=success";
        String cancelUrl = frontendUrl + "/boards/" + boardId + "?checkout=cancel";

        String checkoutUrl = polarApiClient.createCheckout(productId, seatCount, metadata, successUrl, cancelUrl);

        log.info("Board subscription checkout created: boardId={}, billingCycle={}, seats={}, userId={}",
                boardId, billingCycle, seatCount, userId);

        return new CheckoutResponse(checkoutUrl);
    }

    public CheckoutResponse createAiCreditCheckout(String boardId, int creditAmount, String userId) {
        boardService.checkOwner(boardId, userId);

        // Select product based on credit amount
        String productId = resolveAiCreditProductId(creditAmount);

        Map<String, String> metadata = new HashMap<>();
        metadata.put("bridge_type", "ai_credit");
        metadata.put("board_id", boardId);
        metadata.put("user_id", userId);
        metadata.put("credit_amount", String.valueOf(creditAmount));

        String successUrl = frontendUrl + "/boards/" + boardId + "?checkout=success&type=credits";
        String cancelUrl = frontendUrl + "/boards/" + boardId + "?checkout=cancel";

        String checkoutUrl = polarApiClient.createCheckout(productId, 1, metadata, successUrl, cancelUrl);

        log.info("AI credit checkout created: boardId={}, creditAmount={}, userId={}",
                boardId, creditAmount, userId);

        return new CheckoutResponse(checkoutUrl);
    }

    public CheckoutResponse createSeatCheckout(String boardId, int additionalSeats, String userId) {
        boardService.checkOwner(boardId, userId);

        Subscription subscription = subscriptionRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        if (!subscription.isActive()) {
            throw new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND);
        }

        String productId = subscription.getBillingCycle() == BillingCycle.YEARLY
                ? polarConfig.getProducts().getBoardYearly()
                : polarConfig.getProducts().getBoardMonthly();

        Map<String, String> metadata = new HashMap<>();
        metadata.put("bridge_type", "seat_purchase");
        metadata.put("board_id", boardId);
        metadata.put("user_id", userId);
        metadata.put("additional_seats", String.valueOf(additionalSeats));

        String successUrl = frontendUrl + "/boards/" + boardId + "?checkout=success&type=seats";
        String cancelUrl = frontendUrl + "/boards/" + boardId + "?checkout=cancel";

        String checkoutUrl = polarApiClient.createCheckout(productId, additionalSeats, metadata, successUrl, cancelUrl);

        log.info("Seat checkout created: boardId={}, additionalSeats={}, userId={}",
                boardId, additionalSeats, userId);

        return new CheckoutResponse(checkoutUrl);
    }

    private String resolveAiCreditProductId(int creditAmount) {
        if (creditAmount >= 1000) {
            return polarConfig.getProducts().getCredit1000();
        } else if (creditAmount >= 500) {
            return polarConfig.getProducts().getCredit500();
        } else {
            return polarConfig.getProducts().getCredit100();
        }
    }

    private void createMockPayment(Subscription subscription, int amount, int memberCount) {
        PaymentHistory payment = PaymentHistory.builder()
                .subscription(subscription)
                .amount(amount)
                .billingCycle(subscription.getBillingCycle())
                .status(PaymentStatus.PAID)
                .pgProvider("POLAR")
                .pgTransactionId("local_" + UUID.randomUUID().toString().substring(0, 8))
                .periodStart(subscription.getCurrentPeriodStart() != null
                        ? subscription.getCurrentPeriodStart()
                        : LocalDateTime.now(ZoneOffset.UTC))
                .periodEnd(subscription.getCurrentPeriodEnd() != null
                        ? subscription.getCurrentPeriodEnd()
                        : LocalDateTime.now(ZoneOffset.UTC).plusMonths(1))
                .memberCount(memberCount)
                .paidAt(LocalDateTime.now(ZoneOffset.UTC))
                .build();
        paymentHistoryRepository.save(payment);
    }
}
