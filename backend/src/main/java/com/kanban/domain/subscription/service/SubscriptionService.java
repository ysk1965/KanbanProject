package com.kanban.domain.subscription.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.subscription.*;
import com.kanban.domain.subscription.dto.SubscriptionRequest;
import com.kanban.domain.subscription.dto.SubscriptionResponse;
import com.kanban.domain.subscription.dto.TossPaymentResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
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
    private final TossPaymentsService tossPaymentsService;

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

        subscription.cancel();

        log.info("Subscription canceled for board: {} by user: {}", boardId, userId);
    }

    @Transactional
    public SubscriptionResponse.Detail confirmAndStartSubscription(
            String userId, SubscriptionRequest.ConfirmSubscription request) {

        String boardId = request.getBoardId();
        boardService.checkOwner(boardId, userId);

        Subscription subscription = subscriptionRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        // 1. 금액 검증
        int currentBillable = boardMemberRepository.countBillableMembers(boardId);
        int seatCount = Math.max(request.getSeatCount(), currentBillable);
        int pricePerSeat = request.getBillingCycle() == BillingCycle.YEARLY
                ? Subscription.YEARLY_PRICE_PER_SEAT
                : Subscription.MONTHLY_PRICE_PER_SEAT;
        int expectedAmount = pricePerSeat * seatCount;

        if (!request.getAmount().equals(expectedAmount)) {
            log.error("Payment amount mismatch: expected={}, actual={}, boardId={}",
                    expectedAmount, request.getAmount(), boardId);
            throw new BusinessException(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }

        // 2. Toss 결제 승인
        TossPaymentResponse tossResponse = tossPaymentsService.confirmPayment(
                request.getPaymentKey(), request.getOrderId(), request.getAmount());

        // 3. 구독 활성화
        subscription.activateSeatSubscription(
                request.getBillingCycle(), seatCount, request.getPaymentKey());
        subscription.updateBillableMemberCount(currentBillable);

        // 4. Board tier를 PREMIUM으로 전환
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        board.upgradeToPremium();

        // 5. 결제 이력 생성 (실제 PG 정보)
        createTossPayment(subscription, request.getAmount(), seatCount, request.getPaymentKey());

        log.info("Toss subscription confirmed for board: {} by user: {}. Seats: {}, Cycle: {}, PaymentKey: {}",
                boardId, userId, seatCount, request.getBillingCycle(), request.getPaymentKey());

        return SubscriptionResponse.Detail.of(subscription);
    }

    @Transactional
    public SubscriptionResponse.Detail confirmAndPurchaseSeats(
            String userId, SubscriptionRequest.ConfirmSeatPurchase request) {

        String boardId = request.getBoardId();
        boardService.checkOwner(boardId, userId);

        Subscription subscription = subscriptionRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND));

        if (!subscription.isActive()) {
            throw new BusinessException(ErrorCode.SUBSCRIPTION_NOT_FOUND);
        }

        // 1. 금액 검증
        int additionalSeats = request.getAdditionalSeats();
        int expectedAmount = additionalSeats * subscription.getPricePerSeat();

        if (!request.getAmount().equals(expectedAmount)) {
            log.error("Seat purchase amount mismatch: expected={}, actual={}, boardId={}",
                    expectedAmount, request.getAmount(), boardId);
            throw new BusinessException(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }

        // 2. Toss 결제 승인
        TossPaymentResponse tossResponse = tossPaymentsService.confirmPayment(
                request.getPaymentKey(), request.getOrderId(), request.getAmount());

        // 3. 시트 수 업데이트
        int newSeatCount = subscription.getSeatCount() + additionalSeats;
        subscription.updateSeatCount(newSeatCount);

        int currentBillable = boardMemberRepository.countBillableMembers(boardId);
        subscription.updateBillableMemberCount(currentBillable);

        // 4. 결제 이력 생성
        createTossPayment(subscription, request.getAmount(), newSeatCount, request.getPaymentKey());

        log.info("Toss seat purchase confirmed for board: {} by user: {}. Additional: {}, New total: {}, PaymentKey: {}",
                boardId, userId, additionalSeats, newSeatCount, request.getPaymentKey());

        return SubscriptionResponse.Detail.of(subscription);
    }

    private void createTossPayment(Subscription subscription, int amount, int memberCount, String paymentKey) {
        PaymentHistory payment = PaymentHistory.builder()
                .subscription(subscription)
                .amount(amount)
                .billingCycle(subscription.getBillingCycle())
                .status(PaymentStatus.PAID)
                .pgProvider("TOSSPAYMENTS")
                .pgTransactionId(paymentKey)
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

    private void createMockPayment(Subscription subscription, int amount, int memberCount) {
        PaymentHistory payment = PaymentHistory.builder()
                .subscription(subscription)
                .amount(amount)
                .billingCycle(subscription.getBillingCycle())
                .status(PaymentStatus.PAID)
                .pgProvider("MOCK")
                .pgTransactionId("mock_" + UUID.randomUUID().toString().substring(0, 8))
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
