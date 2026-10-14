package com.kanban.global.scheduler;

import com.kanban.domain.subscription.PolarWebhookDeliveryRepository;
import com.kanban.domain.user.EmailVerificationTokenRepository;
import com.kanban.domain.user.PasswordResetTokenRepository;
import com.kanban.domain.user.RefreshTokenRepository;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 만료된 토큰(Refresh, 이메일 인증, 비밀번호 재설정)과 오래된 Polar 웹훅 수신 기록 자동 정리 (매일 새벽 2시 UTC 실행)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ExpiredTokenCleanupScheduler {

    private final RefreshTokenRepository refreshTokenRepository;
    private final EmailVerificationTokenRepository emailVerificationTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PolarWebhookDeliveryRepository polarWebhookDeliveryRepository;

    /** Polar 는 며칠 안에 재전송을 멈춘다 — 멱등성 기록은 30일이면 충분하다 */
    static final int WEBHOOK_DELIVERY_RETENTION_DAYS = 30;

    @Scheduled(cron = "0 0 2 * * *")
    @SchedulerLock(name = "ExpiredTokenCleanupScheduler.cleanup", lockAtMostFor = "30m", lockAtLeastFor = "5m")
    @Transactional
    public void cleanup() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);

        int refreshDeleted = refreshTokenRepository.deleteExpiredTokens(now);
        emailVerificationTokenRepository.deleteExpiredTokens(now);
        passwordResetTokenRepository.deleteExpiredTokens(now);

        if (refreshDeleted > 0) {
            log.info("Expired token cleanup: deleted {} refresh tokens", refreshDeleted);
        }

        int webhookDeleted =
                polarWebhookDeliveryRepository.deleteReceivedBefore(now.minusDays(WEBHOOK_DELIVERY_RETENTION_DAYS));
        if (webhookDeleted > 0) {
            log.info(
                    "Polar webhook delivery cleanup: deleted {} records older than {} days",
                    webhookDeleted,
                    WEBHOOK_DELIVERY_RETENTION_DAYS);
        }
    }
}
