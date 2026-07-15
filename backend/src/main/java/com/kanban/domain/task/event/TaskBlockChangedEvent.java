package com.kanban.domain.task.event;

/**
 * Task가 다른 블록으로 이동해 커밋된 뒤 발행되는 도메인 이벤트.
 *
 * <p>core(task) → integration(jira) 역방향 의존을 피하려 이벤트로 분리한다.
 * JIRA push 리스너가 {@code @TransactionalEventListener(AFTER_COMMIT)}로 수신해
 * 블록↔status 매핑에 따라 JIRA transition을 실행한다(개발 소유 push).
 */
public record TaskBlockChangedEvent(
    String boardId,
    String taskId,
    String targetBlockId
) {}
