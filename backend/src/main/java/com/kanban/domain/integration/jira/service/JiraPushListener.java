package com.kanban.domain.integration.jira.service;

import com.kanban.domain.task.event.TaskBlockChangedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Task 블록 이동 → JIRA push 브리지 (Phase 2).
 *
 * <p>커밋 이후({@code AFTER_COMMIT})에만 실행해 롤백된 이동을 push하지 않는다.
 * {@code @Async}로 응답을 막지 않는다(낙관적 UI). JIRA 미연동/미매핑이면 서비스단에서 no-op.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JiraPushListener {

    private final JiraWriteBackService writeBackService;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTaskBlockChanged(TaskBlockChangedEvent event) {
        try {
            writeBackService.pushBlockStatus(event.boardId(), event.taskId(), event.targetBlockId());
        } catch (Exception e) {
            log.warn("JIRA push listener failed for task {}: {}", event.taskId(), e.getMessage());
        }
    }
}
