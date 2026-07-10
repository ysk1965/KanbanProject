package com.kanban.domain.task;

import com.kanban.domain.task.service.TaskKeyBackfillService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 앱 시작 시 사람이 읽는 키가 없는 기존 보드에 키를 소급 부여한다.
 * 프리픽스가 채워지면 다음 부팅부터는 조회 1회로 조용히 종료된다(멱등).
 */
@Slf4j
@Component
@Order(100)
@RequiredArgsConstructor
public class TaskKeyBackfillRunner implements ApplicationRunner {

    private final TaskKeyBackfillService backfillService;

    @Override
    public void run(ApplicationArguments args) {
        List<String> boardIds = backfillService.findBoardIdsNeedingBackfill();
        if (boardIds.isEmpty()) {
            return;
        }

        log.info("TaskKey backfill: {} boards need keying", boardIds.size());
        int done = 0;
        int failed = 0;
        for (String boardId : boardIds) {
            try {
                backfillService.backfillBoard(boardId);
                done++;
            } catch (Exception e) {
                failed++;
                log.warn("TaskKey backfill failed for board {}: {}", boardId, e.getMessage());
            }
        }
        log.info("TaskKey backfill complete: {} done, {} failed", done, failed);
    }
}
