package com.kanban.domain.subscription.service;

import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.subscription.*;
import com.kanban.domain.subscription.dto.SubscriptionRequest;
import com.kanban.domain.subscription.dto.SubscriptionResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SubscriptionService {

    private final SubscriptionRepository subscriptionRepository;
    private final PricingPlanRepository pricingPlanRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final BoardService boardService;

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

        PricingPlan plan = pricingPlanRepository.findById(request.getPlanId())
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT_VALUE));

        // 현재 멤버 수에 맞는 플랜인지 확인
        int currentBillable = boardMemberRepository.countBillableMembers(boardId);
        if (currentBillable < plan.getMinMembers() || currentBillable > plan.getMaxMembers()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        int price = request.getBillingCycle() == BillingCycle.YEARLY
                ? plan.getYearlyPrice()
                : plan.getMonthlyPrice();

        subscription.activateSubscription(
                plan.getId(),
                request.getBillingCycle(),
                price,
                request.getPaymentMethodId()
        );

        log.info("Subscription started for board: {} with plan: {} by user: {}",
                boardId, plan.getId(), userId);

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

        PricingPlan plan = pricingPlanRepository.findById(request.getPlanId())
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT_VALUE));

        int price = request.getBillingCycle() == BillingCycle.YEARLY
                ? plan.getYearlyPrice()
                : plan.getMonthlyPrice();

        subscription.updatePlan(plan.getId(), request.getBillingCycle(), price);

        log.info("Subscription plan changed for board: {} to plan: {} by user: {}",
                boardId, plan.getId(), userId);

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
}
