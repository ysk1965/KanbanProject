package com.kanban.global.scheduler;

import com.kanban.domain.board.Board;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.subscription.service.AiCreditService;
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
    private final AiCreditService aiCreditService;

    /**
     * Trial 만료 자동 처리: 매시간 실행
     * - 만료된 Trial Subscription → CANCELED 상태로 전환
     * - 연관 Board → STANDARD tier로 다운그레이드
     */
    @Scheduled(cron = "0 0 * * * *")
    @Transactional
    public void expireTrials() {
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
     * AI 크레딧 월간 리셋: 매시간 5분에 실행
     * - creditsResetDate가 현재 시각 이전인 구독의 월간 크레딧을 리셋
     * - 각 구독의 monthlyCreditsUsed → 0, creditsResetDate → +1개월
     */
    @Scheduled(cron = "0 5 * * * *")
    @Transactional
    public void resetMonthlyAiCredits() {
        try {
            aiCreditService.resetMonthlyCredits();
        } catch (Exception e) {
            log.error("Failed to reset monthly AI credits: {}", e.getMessage(), e);
        }
    }
}
