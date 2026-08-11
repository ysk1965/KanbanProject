package com.kanban.global.scheduler;

import com.kanban.domain.user.EmailVerificationTokenRepository;
import com.kanban.domain.user.PasswordResetTokenRepository;
import com.kanban.domain.user.RefreshTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

/**
 * 만료된 토큰(Refresh, 이메일 인증, 비밀번호 재설정) 자동 정리 (매일 새벽 2시 UTC 실행)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ExpiredTokenCleanupScheduler {

    private final RefreshTokenRepository refreshTokenRepository;
    private final EmailVerificationTokenRepository emailVerificationTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;

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
    }
}
