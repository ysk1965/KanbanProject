package com.kanban.global.scheduler;

import com.kanban.domain.personal.PersonalTaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

/**
 * 7일 이상 지난 완료된 개인 태스크 자동 삭제 (매일 새벽 3시 30분 실행)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PersonalTaskCleanupScheduler {

    private final PersonalTaskRepository personalTaskRepository;

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void cleanup() {
        LocalDateTime cutoff = LocalDateTime.now(ZoneOffset.UTC).minusDays(7);
        int deleted = personalTaskRepository.deleteCompletedBefore(cutoff);
        if (deleted > 0) {
            log.info("Personal task cleanup: deleted {} completed tasks older than 7 days", deleted);
        }
    }
}
