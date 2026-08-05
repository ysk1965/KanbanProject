package com.kanban.domain.integration.jira.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 확정된 자동수정 결과를 사람이 보는 자리에 남긴다.
 *
 * <p><b>커밋 이후에만 돈다.</b> 통지는 외부 호출(JIRA·슬랙)과 댓글 INSERT를 하는데, 그것들이
 * 결과 확정과 같은 트랜잭션에 있으면 통지 하나가 결과를 되돌린다 — 실제로 작성자 없는 댓글이
 * 커밋 시점 flush에서 터져 {@code job.complete()}까지 함께 롤백된 적이 있다. PR은 열렸는데
 * 작업은 미완으로 남고, 러너는 500을 받아 같은 회신을 계속 재전송했다.
 *
 * <p>{@code @Async}로 요청 스레드에서도 뗀다. 러너는 회신이 받아들여졌다는 사실만 알면 되고,
 * JIRA·슬랙 왕복을 기다릴 이유가 없다.
 *
 * <p>예외는 여기서 끊는다. 통지 실패는 로그로 남을 뿐 되돌릴 것이 없다 — 결과는 이미 커밋됐다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JiraAutofixResultListener {

    private final JiraAutofixQueueService queueService;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onResultSettled(JiraAutofixResultSettledEvent event) {
        try {
            queueService.publishResult(
                    event.boardId(), event.jobId(), event.result(), event.corrected());
        } catch (Exception e) {
            log.warn("Autofix: 결과 통지 실패 board={} job={}: {}",
                    event.boardId(), event.jobId(), e.getMessage(), e);
        }
    }
}
