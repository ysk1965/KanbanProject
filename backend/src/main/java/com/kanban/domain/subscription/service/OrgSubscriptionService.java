package com.kanban.domain.subscription.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.subscription.*;
import com.kanban.domain.subscription.config.PolarConfig;
import com.kanban.domain.subscription.dto.CheckoutResponse;
import com.kanban.domain.subscription.dto.MigrationPreviewResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Slf4j
@Service
@Transactional
@RequiredArgsConstructor
public class OrgSubscriptionService {

    private final OrgSubscriptionRepository orgSubscriptionRepository;
    private final OrgPaymentHistoryRepository orgPaymentHistoryRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final PolarApiClient polarApiClient;
    private final PolarConfig polarConfig;

    @Value("${app.frontend-url:https://bridgespots.com}")
    private String frontendUrl;

    // === Query ===

    @Transactional(readOnly = true)
    public OrgSubscription getSubscription(String orgId) {
        return orgSubscriptionRepository.findByOrganizationId(orgId)
            .orElseThrow(() -> new BusinessException(ErrorCode.ORG_SUBSCRIPTION_NOT_FOUND));
    }

    // === Plan Activation ===

    public OrgSubscription activateTeam(String orgId, BillingCycle cycle, int seatCount, String paymentMethodId) {
        OrgSubscription sub = orgSubscriptionRepository.findByOrganizationIdForUpdate(orgId)
            .orElseThrow(() -> new BusinessException(ErrorCode.ORG_SUBSCRIPTION_NOT_FOUND));
        sub.activateTeam(cycle, seatCount, paymentMethodId);
        return orgSubscriptionRepository.save(sub);
    }

    // === Trial Expiry (called by scheduler) ===

    public void expireTrials() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        List<OrgSubscription> expired = orgSubscriptionRepository
            .findByStatusAndTrialEndsAtBefore(SubscriptionStatus.TRIAL, now);
        for (OrgSubscription sub : expired) {
            sub.expireTrialToFree();
        }
        if (!expired.isEmpty()) {
            log.info("Expired {} org trial subscriptions", expired.size());
        }
    }

    // === Access Control (called by other services) ===

    @Transactional(readOnly = true)
    public boolean canAccessHrFeatures(String orgId) {
        return orgSubscriptionRepository.findByOrganizationId(orgId)
            .map(OrgSubscription::canAccessHrFeatures).orElse(false);
    }

    @Transactional(readOnly = true)
    public boolean canReadHrData(String orgId) {
        return orgSubscriptionRepository.findByOrganizationId(orgId)
            .map(OrgSubscription::canReadHrData).orElse(false);
    }

    @Transactional(readOnly = true)
    public boolean canCreateOrgBoard(String orgId) {
        return orgSubscriptionRepository.findByOrganizationId(orgId)
            .map(OrgSubscription::canCreateOrgBoard).orElse(false);
    }

    @Transactional(readOnly = true)
    public boolean canInviteMember(String orgId) {
        return orgSubscriptionRepository.findByOrganizationId(orgId)
            .map(OrgSubscription::canInviteMember).orElse(true);
    }

    // === Migration ===

    @Transactional(readOnly = true)
    public MigrationPreviewResponse previewMigration(String orgId, BillingCycle cycle, List<String> boardIds) {
        // 1. Calculate unique members across boards
        Set<String> uniqueUserIds = new HashSet<>();
        for (String boardId : boardIds) {
            boardMemberRepository.findByBoardId(boardId)
                .forEach(m -> uniqueUserIds.add(m.getUser().getId()));
        }
        int uniqueMembers = uniqueUserIds.size();

        // 2. Calculate current total monthly and credit from existing subscriptions
        int currentTotalMonthly = 0;
        int totalCredit = 0;
        for (String boardId : boardIds) {
            Subscription sub = subscriptionRepository.findByBoardId(boardId).orElse(null);
            if (sub != null && sub.isActive()) {
                currentTotalMonthly += sub.getPrice() != null ? sub.getPrice() : 0;
                totalCredit += calculateRemainingCredit(sub);
            }
        }

        // 3. New org price
        int pricePerSeat = (cycle == BillingCycle.YEARLY)
            ? OrgSubscription.YEARLY_PRICE_PER_SEAT
            : OrgSubscription.MONTHLY_PRICE_PER_SEAT;
        int newMonthly = uniqueMembers * pricePerSeat;
        int firstPayment = Math.max(0, newMonthly - totalCredit);

        return new MigrationPreviewResponse(currentTotalMonthly, newMonthly, totalCredit, firstPayment, uniqueMembers);
    }

    public OrgSubscription migrateFromBoardSubscriptions(String orgId, BillingCycle cycle,
            List<String> boardIds, String paymentMethodId) {
        MigrationPreviewResponse preview = previewMigration(orgId, cycle, boardIds);

        // 1. Activate Team
        OrgSubscription orgSub = activateTeam(orgId, cycle, preview.uniqueMembers(), paymentMethodId);

        // 2. Migrate each board
        for (String boardId : boardIds) {
            Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
            board.updateTier(BoardTier.ORG_MANAGED);

            subscriptionRepository.findByBoardId(boardId)
                .ifPresent(sub -> sub.markMigratedToOrg(orgId));
        }

        // 3. Payment history
        OrgPaymentHistory payment = OrgPaymentHistory.create(
            orgSub, preview.firstPayment(), preview.creditFromExisting(), OrgPaymentType.MIGRATION);
        orgPaymentHistoryRepository.save(payment);

        log.info("Migrated {} boards to org subscription: orgId={}, firstPayment={}",
            boardIds.size(), orgId, preview.firstPayment());

        return orgSub;
    }

    // === Polar Checkout ===

    public CheckoutResponse createOrgSubscriptionCheckout(String orgId, BillingCycle billingCycle, int seatCount, String userId) {
        String productId = billingCycle == BillingCycle.YEARLY
                ? polarConfig.getProducts().getOrgYearly()
                : polarConfig.getProducts().getOrgMonthly();

        Map<String, String> metadata = new HashMap<>();
        metadata.put("bridge_type", "org_subscription");
        metadata.put("org_id", orgId);
        metadata.put("user_id", userId);
        metadata.put("billing_cycle", billingCycle.name());
        metadata.put("seat_count", String.valueOf(seatCount));

        String successUrl = frontendUrl + "/organizations/" + orgId + "?checkout=success";
        String cancelUrl = frontendUrl + "/organizations/" + orgId + "?checkout=cancel";

        String checkoutUrl = polarApiClient.createCheckout(productId, seatCount, metadata, successUrl, cancelUrl);

        log.info("Org subscription checkout created: orgId={}, billingCycle={}, seats={}, userId={}",
                orgId, billingCycle, seatCount, userId);

        return new CheckoutResponse(checkoutUrl);
    }

    // === Seat Management ===

    public OrgSubscription purchaseAdditionalSeats(String orgId, int additionalSeats) {
        OrgSubscription sub = orgSubscriptionRepository.findByOrganizationIdForUpdate(orgId)
            .orElseThrow(() -> new BusinessException(ErrorCode.ORG_SUBSCRIPTION_NOT_FOUND));

        if (sub.getPlan() != OrgPlan.TEAM) {
            throw new BusinessException(ErrorCode.ORG_TEAM_REQUIRED);
        }

        int newSeatCount = sub.getSeatCount() + additionalSeats;
        sub.updateSeatCount(newSeatCount);
        return orgSubscriptionRepository.save(sub);
    }

    // === Cancel / Downgrade ===

    public void cancel(String orgId) {
        OrgSubscription orgSub = orgSubscriptionRepository.findByOrganizationIdForUpdate(orgId)
            .orElseThrow(() -> new BusinessException(ErrorCode.ORG_SUBSCRIPTION_NOT_FOUND));
        orgSub.cancel();

        // Restore boards
        boardRepository.findByOrganizationId(orgId).forEach(board -> {
            board.updateTier(BoardTier.STANDARD);
            subscriptionRepository.findByBoardId(board.getId())
                .ifPresent(Subscription::restoreFromOrg);
        });

        log.info("Org subscription canceled: orgId={}", orgId);
    }

    public void downgradeToFree(String orgId) {
        // Restore boards first
        boardRepository.findByOrganizationId(orgId).forEach(board -> {
            board.updateTier(BoardTier.STANDARD);
            subscriptionRepository.findByBoardId(board.getId())
                .ifPresent(Subscription::restoreFromOrg);
        });

        OrgSubscription orgSub = orgSubscriptionRepository.findByOrganizationIdForUpdate(orgId)
            .orElseThrow(() -> new BusinessException(ErrorCode.ORG_SUBSCRIPTION_NOT_FOUND));
        orgSub.expireTrialToFree();

        log.info("Org subscription downgraded to FREE: orgId={}", orgId);
    }

    // === Payment History ===

    @Transactional(readOnly = true)
    public List<OrgPaymentHistory> getPaymentHistory(String orgId) {
        OrgSubscription sub = getSubscription(orgId);
        return orgPaymentHistoryRepository.findByOrgSubscriptionIdOrderByCreatedAtDesc(sub.getId());
    }

    // === Private Helpers ===

    private int calculateRemainingCredit(Subscription sub) {
        if (sub.getCurrentPeriodStart() == null || sub.getCurrentPeriodEnd() == null) {
            return 0;
        }
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        long totalDays = ChronoUnit.DAYS.between(sub.getCurrentPeriodStart(), sub.getCurrentPeriodEnd());
        long remainingDays = ChronoUnit.DAYS.between(now, sub.getCurrentPeriodEnd());
        if (remainingDays <= 0 || totalDays <= 0) return 0;
        int price = sub.getPrice() != null ? sub.getPrice() : 0;
        return (int) (price * remainingDays / totalDays);
    }
}
