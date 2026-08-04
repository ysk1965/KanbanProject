package com.kanban.domain.integration.jira.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 자동수정 큐의 유일한 서버측 주기 작업 — 방치된 작업 회수.
 *
 * <p>작업을 내보내는 펌프는 없다. 러너가 claim으로 가져가므로 서버가 밀어 넣을 일이 없다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JiraAutofixScheduler {

    private final JiraAutofixQueueService queueService;

    /**
     * 매 5분 — 회신이 오지 않은 작업을 회수한다.
     *
     * <p>맥이 잠들거나 데몬이 죽으면 아무도 알려주지 않는다. 이게 없으면 DISPATCHED 하나가
     * 그 보드의 큐를 영구히 막는다. 자동수정을 꺼도(dispatch-enabled=false) 이 회수는 계속
     * 돌아야 한다 — 끄는 순간 물고 있던 작업이 영원히 남는다.
     */
    @Scheduled(cron = "0 */5 * * * *")
    public void sweepStale() {
        try {
            queueService.sweepStaleDispatches();
        } catch (Exception e) {
            log.warn("Autofix stale sweep failed: {}", e.getMessage());
        }
    }
}
