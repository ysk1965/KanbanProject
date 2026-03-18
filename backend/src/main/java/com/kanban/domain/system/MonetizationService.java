package com.kanban.domain.system;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.subscription.OrgPlan;
import com.kanban.domain.subscription.OrgSubscription;
import com.kanban.domain.subscription.OrgSubscriptionRepository;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.subscription.SubscriptionStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class MonetizationService {
    private final SystemConfigRepository systemConfigRepository;
    private final BoardRepository boardRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final OrgSubscriptionRepository orgSubscriptionRepository;

    private static final String KEY = "MONETIZATION_ENABLED";
    private static final boolean DEFAULT_VALUE = true;

    @Transactional(readOnly = true)
    public boolean isMonetizationEnabled() {
        return systemConfigRepository.findById(KEY)
            .map(c -> Boolean.parseBoolean(c.getValue()))
            .orElse(DEFAULT_VALUE);
    }

    @Transactional
    public void setMonetizationEnabled(boolean enabled) {
        SystemConfig config = systemConfigRepository.findById(KEY)
            .orElseGet(() -> SystemConfig.builder()
                .key(KEY)
                .value(String.valueOf(enabled))
                .build());
        config.updateValue(String.valueOf(enabled));
        systemConfigRepository.save(config);

        if (!enabled) {
            upgradeAllExistingEntities();
        }
    }

    private void upgradeAllExistingEntities() {
        // 1. TRIAL/STANDARD boards → PREMIUM + Subscription ACTIVE
        List<Board> boards = boardRepository.findByTierIn(
            List.of(BoardTier.TRIAL, BoardTier.STANDARD));
        for (Board board : boards) {
            board.updateTier(BoardTier.PREMIUM);
            subscriptionRepository.findByBoardId(board.getId())
                .ifPresent(Subscription::upgradeByAdmin);
        }
        log.info("[Monetization OFF] Upgraded {} boards to PREMIUM", boards.size());

        // 2. FREE/TRIAL org subscriptions → TEAM + ACTIVE
        List<OrgSubscription> orgSubs = orgSubscriptionRepository.findByPlanOrStatus(
            OrgPlan.FREE, SubscriptionStatus.TRIAL);
        for (OrgSubscription sub : orgSubs) {
            sub.setPlan(OrgPlan.TEAM);
            sub.setStatus(SubscriptionStatus.ACTIVE);
            sub.setBoardLimit(Integer.MAX_VALUE);
            if (sub.getMonthlyAiCredits() == null || sub.getMonthlyAiCredits() == 0) {
                sub.initializeCredits(OrgSubscription.ORG_MONTHLY_CREDITS);
            }
        }
        log.info("[Monetization OFF] Upgraded {} org subscriptions to TEAM", orgSubs.size());
    }
}
