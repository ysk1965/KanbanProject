package com.kanban.domain.checklist.event;

/**
 * 체크리스트 항목의 담당자가 바뀌어 커밋된 뒤 발행되는 도메인 이벤트.
 *
 * <p>core(checklist) → integration(jira) 역방향 의존을 피하려 이벤트로 분리한다
 * ({@code TaskBlockChangedEvent}와 같은 규약). JIRA push 리스너가
 * {@code @TransactionalEventListener(AFTER_COMMIT)}로 수신해, 그 항목이 JIRA 담당자를
 * 대표하는 항목이면 이슈 담당자를 함께 옮긴다.
 *
 * <p>새 담당자를 실어 보내지 않고 id만 넘기는 이유: 리스너가 커밋 이후에 항목을 다시 읽어
 * 외주 인력 배정·항목 삭제 같은 다른 경우까지 그 자리에서 판정하기 때문이다.
 */
public record ChecklistAssigneeChangedEvent(
    String boardId,
    String taskId,
    String itemId
) {}
