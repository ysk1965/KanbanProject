package com.kanban.global.scheduler;

import com.kanban.domain.personal.PersonalTaskRepository;
import com.kanban.domain.personal.feature.PersonalFeatureDocRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

/**
 * 7일 이상 지난 완료된 개인 태스크 자동 삭제 (매일 새벽 3시 30분 실행)
 * + 소프트 삭제 30일이 지난 「기능」 탭 문서 하드 삭제
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PersonalTaskCleanupScheduler {

    private final PersonalTaskRepository personalTaskRepository;
    private final PersonalFeatureDocRepository personalFeatureDocRepository;

    @Scheduled(cron = "0 30 3 * * *")
    @SchedulerLock(name = "PersonalTaskCleanupScheduler.cleanup", lockAtMostFor = "30m", lockAtLeastFor = "5m")
    @Transactional
    public void cleanup() {
        LocalDateTime cutoff = LocalDateTime.now(ZoneOffset.UTC).minusDays(7);
        int deleted = personalTaskRepository.deleteCompletedBefore(cutoff);
        if (deleted > 0) {
            log.info("Personal task cleanup: deleted {} completed tasks older than 7 days", deleted);
        }

        LocalDateTime docCutoff = LocalDateTime.now(ZoneOffset.UTC).minusDays(30);
        int purgedDocs = personalFeatureDocRepository.deleteSoftDeletedBefore(docCutoff);
        if (purgedDocs > 0) {
            log.info("Personal feature doc cleanup: purged {} docs soft-deleted more than 30 days ago", purgedDocs);
        }
    }
}
