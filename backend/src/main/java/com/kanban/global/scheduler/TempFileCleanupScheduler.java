package com.kanban.global.scheduler;

import com.kanban.global.service.FileUploadService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 만료된 임시 업로드 파일 정리 (30분마다 실행)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TempFileCleanupScheduler {

    private final FileUploadService fileUploadService;

    @Scheduled(fixedRate = 1800000) // 30분
    public void cleanup() {
        log.debug("Running temp file cleanup...");
        fileUploadService.cleanupExpiredTemp();
    }
}
