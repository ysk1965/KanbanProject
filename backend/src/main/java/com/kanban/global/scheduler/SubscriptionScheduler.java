package com.kanban.global.scheduler;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.subscription.*;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.domain.subscription.service.OrgSubscriptionService;
import com.kanban.domain.system.MonetizationService;
import com.kanban.global.security.WebSocketAuthInterceptor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class SubscriptionScheduler {

    private final SubscriptionRepository subscriptionRepository;
    private final OrgSubscriptionRepository orgSubscriptionRepository;
    private final BoardRepository boardRepository;
    private final AiCreditService aiCreditService;
    private final OrgSubscriptionService orgSubscriptionService;
    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final MonetizationService monetizationService;

    /**
     * Trial 만료 자동 처리: 매시간 실행
     * - 만료된 Trial Subscription → CANCELED 상태로 전환
     * - 연관 Board → STANDARD tier로 다운그레이드
     */
    @Scheduled(cron = "0 0 * * * *")
    @Transactional
    public void expireTrials() {
        if (!monetizationService.isMonetizationEnabled()) {
            log.debug("[Monetization OFF] Skipping expireTrials");
            return;
        }
        try {
            LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
            List<Subscription> expiredTrials = subscriptionRepository.findExpiredTrials(now);

            if (expiredTrials.isEmpty()) {
                return;
            }

            int count = 0;
            for (Subscription subscription : expiredTrials) {
                subscription.cancel();
                Board board = subscription.getBoard();
                if (board != null) {
                    board.checkAndUpdateTierIfTrialExpired();
                }
                count++;
            }

            log.info("Trial expiration: {} subscriptions expired and downgraded to STANDARD", count);
        } catch (Exception e) {
            log.error("Failed to process trial expirations: {}", e.getMessage(), e);
        }
    }

    /**
     * Org Trial 만료 자동 처리: 매시간 15분에 실행
     * - 만료된 Org Trial Subscription → FREE 플랜으로 다운그레이드
     */
    @Scheduled(cron = "0 15 * * * *")
    @Transactional
    public void expireOrgTrials() {
        if (!monetizationService.isMonetizationEnabled()) {
            log.debug("[Monetization OFF] Skipping expireOrgTrials");
            return;
        }
        try {
            orgSubscriptionService.expireTrials();
        } catch (Exception e) {
            log.error("Failed to process org trial expirations: {}", e.getMessage(), e);
        }
    }

    /**
     * 취소 예약 구독 처리: 매시간 20분에 실행
     * - cancelRequestedAt이 설정되고 currentPeriodEnd가 지난 Board 구독 → CANCELED + STANDARD 다운그레이드
     * - cancelRequestedAt이 설정되고 currentPeriodEnd가 지난 Org 구독 → CANCELED + 보드 복원
     */
    @Scheduled(cron = "0 20 * * * *")
    @Transactional
    public void processCancellationRequests() {
        if (!monetizationService.isMonetizationEnabled()) {
            log.debug("[Monetization OFF] Skipping processCancellationRequests");
            return;
        }
        try {
            LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);

            // Board subscriptions
            List<Subscription> pendingBoardCancels = subscriptionRepository.findPendingCancellations(now);
            int boardCount = 0;
            for (Subscription sub : pendingBoardCancels) {
                sub.cancel();
                Board board = sub.getBoard();
                if (board != null) {
                    board.downgradeToStandard();
                    webSocketAuthInterceptor.evictTierCache(board.getId());
                }
                boardCount++;
            }

            // Org subscriptions
            List<OrgSubscription> pendingOrgCancels = orgSubscriptionRepository.findPendingCancellations(now);
            int orgCount = 0;
            for (OrgSubscription orgSub : pendingOrgCancels) {
                orgSub.cancel();
                String orgId = orgSub.getOrganization().getId();
                boardRepository.findByOrganizationId(orgId).forEach(board -> {
                    board.updateTier(BoardTier.STANDARD);
                    subscriptionRepository.findByBoardId(board.getId())
                        .ifPresent(Subscription::restoreFromOrg);
                });
                orgCount++;
            }

            if (boardCount > 0 || orgCount > 0) {
                log.info("Cancellation requests processed: {} board, {} org subscriptions canceled", boardCount, orgCount);
            }
        } catch (Exception e) {
            log.error("Failed to process cancellation requests: {}", e.getMessage(), e);
        }
    }

    /**
     * PAST_DUE 구독 에스컬레이션: 매시간 25분에 실행
     * - pastDueSince가 7일 이상 경과한 Board/Org 구독 → SUSPENDED 전환
     */
    @Scheduled(cron = "0 25 * * * *")
    @Transactional
    public void escalatePastDueSubscriptions() {
        if (!monetizationService.isMonetizationEnabled()) {
            log.debug("[Monetization OFF] Skipping escalatePastDueSubscriptions");
            return;
        }
        try {
            LocalDateTime threshold = LocalDateTime.now(ZoneOffset.UTC).minusDays(7);

            // Board subscriptions
            List<Subscription> pastDueBoards = subscriptionRepository
                    .findByStatusPastDueAndPastDueSinceBefore(threshold);
            int boardCount = 0;
            for (Subscription sub : pastDueBoards) {
                sub.suspend();
                Board board = sub.getBoard();
                if (board != null) {
                    webSocketAuthInterceptor.evictTierCache(board.getId());
                }
                boardCount++;
            }

            // Org subscriptions
            List<OrgSubscription> pastDueOrgs = orgSubscriptionRepository
                    .findByStatusPastDueAndPastDueSinceBefore(threshold);
            int orgCount = 0;
            for (OrgSubscription orgSub : pastDueOrgs) {
                orgSub.suspend();
                orgCount++;
            }

            if (boardCount > 0 || orgCount > 0) {
                log.info("Past-due escalation: {} board, {} org subscriptions escalated to SUSPENDED",
                        boardCount, orgCount);
            }
        } catch (Exception e) {
            log.error("Failed to escalate past-due subscriptions: {}", e.getMessage(), e);
        }
    }

    /**
     * AI 크레딧 월간 리셋: 매시간 5분에 실행
     * - creditsResetDate가 현재 시각 이전인 구독의 월간 크레딧을 리셋
     * - 건별 트랜잭션 분리: 하나의 실패가 다른 구독에 영향 주지 않음
     */
    @Scheduled(cron = "0 5 * * * *")
    public void resetMonthlyAiCredits() {
        if (!monetizationService.isMonetizationEnabled()) {
            log.debug("[Monetization OFF] Skipping resetMonthlyAiCredits");
            return;
        }
        try {
            List<String> subscriptionIds = aiCreditService.findSubscriptionIdsDueForReset();

            if (subscriptionIds.isEmpty()) {
                return;
            }

            int success = 0;
            int failed = 0;

            for (String subscriptionId : subscriptionIds) {
                try {
                    aiCreditService.resetSingleSubscriptionCredits(subscriptionId);
                    success++;
                } catch (Exception e) {
                    failed++;
                    log.error("Failed to reset credits for subscription {}: {}", subscriptionId, e.getMessage());
                }
            }

            log.info("Monthly AI credits reset completed: {} success, {} failed out of {} total",
                    success, failed, subscriptionIds.size());
        } catch (Exception e) {
            log.error("Failed to fetch subscriptions for credit reset: {}", e.getMessage(), e);
        }
    }

    /**
     * Org AI 크레딧 월간 리셋: 매시간 8분에 실행
     * - creditsResetDate가 현재 시각 이전인 OrgSubscription의 월간 크레딧을 리셋
     */
    @Scheduled(cron = "0 8 * * * *")
    public void resetOrgMonthlyAiCredits() {
        if (!monetizationService.isMonetizationEnabled()) {
            log.debug("[Monetization OFF] Skipping resetOrgMonthlyAiCredits");
            return;
        }
        try {
            List<String> orgSubIds = aiCreditService.findOrgSubscriptionIdsDueForReset();

            if (orgSubIds.isEmpty()) {
                return;
            }

            int success = 0;
            int failed = 0;

            for (String orgSubId : orgSubIds) {
                try {
                    aiCreditService.resetSingleOrgSubscriptionCredits(orgSubId);
                    success++;
                } catch (Exception e) {
                    failed++;
                    log.error("Failed to reset org credits for orgSubscription {}: {}", orgSubId, e.getMessage());
                }
            }

            log.info("Org AI credits reset completed: {} success, {} failed out of {} total",
                    success, failed, orgSubIds.size());
        } catch (Exception e) {
            log.error("Failed to fetch org subscriptions for credit reset: {}", e.getMessage(), e);
        }
    }

    /**
     * 유저 개인 AI 크레딧 월간 리셋: 매시간 10분에 실행
     * - personalCreditsResetDate가 현재 시각 이전인 유저의 개인 크레딧을 리셋
     */
    @Scheduled(cron = "0 10 * * * *")
    public void resetUserPersonalAiCredits() {
        if (!monetizationService.isMonetizationEnabled()) {
            log.debug("[Monetization OFF] Skipping resetUserPersonalAiCredits");
            return;
        }
        try {
            List<String> userIds = aiCreditService.findUserIdsDueForPersonalCreditReset();

            if (userIds.isEmpty()) {
                return;
            }

            int success = 0;
            int failed = 0;

            for (String userId : userIds) {
                try {
                    aiCreditService.resetSingleUserPersonalCredits(userId);
                    success++;
                } catch (Exception e) {
                    failed++;
                    log.error("Failed to reset personal credits for user {}: {}", userId, e.getMessage());
                }
            }

            log.info("User personal AI credits reset completed: {} success, {} failed out of {} total",
                    success, failed, userIds.size());
        } catch (Exception e) {
            log.error("Failed to fetch users for personal credit reset: {}", e.getMessage(), e);
        }
    }
}
