package com.kanban.domain.note;

import com.kanban.domain.note.service.NoteSearchTextBackfillService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 앱 시작 시 notes.search_text 가 NULL 인 기존 행을 200건씩 채운다.
 * 채워진 뒤에는 count 1회로 조용히 종료된다(멱등). 어떤 예외도 부팅을 막지 않는다.
 */
@Slf4j
@Component
@Order(110)
@Profile("!test")
@RequiredArgsConstructor
public class NoteSearchTextBackfillRunner implements ApplicationRunner {

    static final int BATCH_SIZE = 200;
    /** 무한 루프 방지 상한 (200 * 10_000 = 2백만 행) */
    private static final int MAX_BATCHES = 10_000;

    private final NoteSearchTextBackfillService backfillService;

    @Override
    public void run(ApplicationArguments args) {
        try {
            long pending = backfillService.countPending();
            if (pending == 0) {
                return;
            }
            log.info("NoteSearchText backfill: {} notes pending", pending);
            int total = 0;
            for (int i = 0; i < MAX_BATCHES; i++) {
                int done = backfillService.backfillBatch(BATCH_SIZE);
                if (done == 0) break;
                total += done;
            }
            log.info("NoteSearchText backfill complete: {} notes updated", total);
        } catch (Exception e) {
            log.warn("NoteSearchText backfill failed (startup continues): {}", e.getMessage(), e);
        }
    }
}
