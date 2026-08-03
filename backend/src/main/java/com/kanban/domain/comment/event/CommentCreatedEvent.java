package com.kanban.domain.comment.event;

/**
 * 사용자가 작성한 댓글이 커밋된 뒤 발행되는 도메인 이벤트.
 *
 * <p>core(comment) → integration(jira) 역방향 의존을 피하려 이벤트로 분리한다
 * ({@code TaskBlockChangedEvent}와 같은 규약). JIRA 댓글 동기화 리스너가
 * {@code @TransactionalEventListener(AFTER_COMMIT)}로 받아 JIRA 코멘트로 push한다.
 *
 * <p><b>시스템 경로에서는 발행하지 않는다</b> — JIRA에서 pull해 만든 댓글이 이 이벤트를 내면
 * 그대로 JIRA로 되돌아가 무한 에코가 된다.
 */
public record CommentCreatedEvent(
    String boardId,
    String taskId,
    String commentId
) {}
