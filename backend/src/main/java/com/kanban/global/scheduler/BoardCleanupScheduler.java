package com.kanban.global.scheduler;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

/**
 * 소프트 삭제된 보드를 7일 후 자동 영구삭제 (매일 새벽 4시 실행)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BoardCleanupScheduler {

    private static final int SOFT_DELETE_RETENTION_DAYS = 7;

    private final BoardRepository boardRepository;
    private final BoardService boardService;

    @Scheduled(cron = "0 0 4 * * *")
    @SchedulerLock(name = "BoardCleanupScheduler.cleanupExpiredSoftDeletedBoards", lockAtMostFor = "30m", lockAtLeastFor = "5m")
    public void cleanupExpiredSoftDeletedBoards() {
        LocalDateTime cutoff = LocalDateTime.now(ZoneOffset.UTC).minusDays(SOFT_DELETE_RETENTION_DAYS);
        List<Board> expiredBoards = boardRepository.findExpiredSoftDeleted(cutoff);

        if (expiredBoards.isEmpty()) {
            return;
        }

        log.info("Board cleanup: found {} boards to permanently delete (deleted before {})",
                expiredBoards.size(), cutoff);

        int successCount = 0;
        for (Board board : expiredBoards) {
            try {
                boardService.permanentlyDeleteBoard(board.getId());
                successCount++;
            } catch (Exception e) {
                log.error("Failed to permanently delete board: {}", board.getId(), e);
            }
        }

        log.info("Board cleanup completed: {}/{} boards permanently deleted",
                successCount, expiredBoards.size());
    }
}
