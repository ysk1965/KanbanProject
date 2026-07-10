package com.kanban.domain.task.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 기존 보드/태스크에 사람이 읽는 키를 소급 부여한다.
 * 프리픽스 파생과 충돌 해소가 절차적이라 순수 SQL 대신 애플리케이션 백필로 처리한다.
 * 보드별로 별도 트랜잭션에서 멱등하게 실행된다(프리픽스가 이미 있으면 건너뜀).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TaskKeyBackfillService {

    private final BoardRepository boardRepository;
    private final TaskRepository taskRepository;
    private final TaskKeyAllocator taskKeyAllocator;

    public List<String> findBoardIdsNeedingBackfill() {
        return boardRepository.findActiveIdsWithoutKeyPrefix();
    }

    @Transactional
    public void backfillBoard(String boardId) {
        Board board = boardRepository.findByIdWithLock(boardId).orElse(null);
        if (board == null || (board.getKeyPrefix() != null && !board.getKeyPrefix().isBlank())) {
            return; // 이미 처리됨 — 멱등
        }

        String prefix = taskKeyAllocator.allocateUniquePrefix(board.getName());
        List<Task> tasks = taskRepository.findByBoardIdOrderByCreatedAtAsc(boardId);

        int seq = 0;
        for (Task task : tasks) {
            if (task.getTaskKey() != null && !task.getTaskKey().isBlank()) {
                if (task.getTaskNumber() != null) {
                    seq = Math.max(seq, task.getTaskNumber());
                }
                continue;
            }
            seq++;
            task.assignKey(seq, prefix + "-" + seq);
        }

        board.initTaskKeying(prefix, seq);
        log.info("TaskKey backfill: board {} → prefix '{}', {} tasks numbered", boardId, prefix, seq);
    }
}
