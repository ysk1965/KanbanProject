package com.kanban.domain.integration.jira.service;

import com.kanban.domain.comment.event.CommentCreatedEvent;
import com.kanban.domain.comment.event.CommentDeletedEvent;
import com.kanban.domain.task.event.TaskBlockChangedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * BRIDGE 변경 → JIRA push 브리지. Task 블록 이동(Phase 2)과 댓글 생성/삭제를 받는다.
 *
 * <p>커밋 이후({@code AFTER_COMMIT})에만 실행해 롤백된 변경을 push하지 않는다.
 * {@code @Async}로 응답을 막지 않는다(낙관적 UI). JIRA 미연동/미매핑이면 서비스단에서 no-op.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JiraPushListener {

    private final JiraWriteBackService writeBackService;
    private final JiraCommentSyncService commentSyncService;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTaskBlockChanged(TaskBlockChangedEvent event) {
        try {
            writeBackService.pushBlockStatus(event.boardId(), event.taskId(), event.targetBlockId());
        } catch (Exception e) {
            log.warn("JIRA push listener failed for task {}: {}", event.taskId(), e.getMessage());
        }
    }

    /** BRIDGE 댓글 → JIRA 코멘트 작성. JIRA에서 들어온 댓글은 이벤트 자체가 발행되지 않는다. */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCommentCreated(CommentCreatedEvent event) {
        try {
            commentSyncService.pushCreate(event.boardId(), event.taskId(), event.commentId());
        } catch (Exception e) {
            log.warn("JIRA comment push listener failed for comment {}: {}", event.commentId(), e.getMessage());
        }
    }

    /** BRIDGE 댓글 삭제 → JIRA 코멘트 삭제. 이 시점에 BRIDGE 댓글 행은 이미 없다. */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCommentDeleted(CommentDeletedEvent event) {
        try {
            commentSyncService.pushDelete(event.boardId(), event.commentId());
        } catch (Exception e) {
            log.warn("JIRA comment delete listener failed for comment {}: {}", event.commentId(), e.getMessage());
        }
    }
}
