package com.kanban.global.scheduler;

import com.kanban.domain.activity.ActivityLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

/**
 * 10일 이상 지난 활동 로그 자동 정리 (매일 새벽 3시 실행)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ActivityLogCleanupScheduler {

    private final ActivityLogRepository activityLogRepository;

    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void cleanup() {
        LocalDateTime cutoff = LocalDateTime.now(ZoneOffset.UTC).minusDays(10);
        int deleted = activityLogRepository.deleteByCreatedAtBefore(cutoff);
        if (deleted > 0) {
            log.info("Activity log cleanup: deleted {} logs older than 10 days", deleted);
        }
    }
}
