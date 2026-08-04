package com.kanban.domain.integration.jira.service;

import com.kanban.domain.integration.jira.JiraAutofixJobRepository;
import com.kanban.domain.integration.jira.config.AutofixProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 자동수정 큐 펌프. {@code JiraSyncScheduler} 패턴을 따른다.
 *
 * <p>보드당 한 번에 한 건씩만 내보낸다 — 러너 쪽 concurrency group과 중복 방어지만, BRIDGE가
 * 먼저 막아야 GitHub Actions 큐에 작업이 쌓여 추적이 흐려지는 것을 피할 수 있다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JiraAutofixScheduler {

    private final AutofixProperties properties;
    private final JiraAutofixQueueService queueService;
    private final JiraAutofixJobRepository jobRepository;

    /**
     * 매 1분 — 큐가 남은 보드마다 다음 한 건을 내보낸다.
     * 전 보드를 훑지 않고 QUEUED가 있는 보드만 대상으로 한다.
     */
    @Scheduled(cron = "0 * * * * *")
    public void pumpQueue() {
        if (!properties.isSchedulerEnabled()) return;

        List<String> boardIds = jobRepository.findBoardIdsWithQueuedJobs();
        if (boardIds.isEmpty()) return;

        for (String boardId : boardIds) {
            try {
                queueService.dispatchNext(boardId);
            } catch (Exception e) {
                // 한 보드의 설정 문제(워크플로 미배치 등)가 다른 보드를 막지 않게 한다.
                // 작업은 QUEUED로 남으므로 원인을 고치면 다음 주기에 다시 시도된다.
                log.warn("Autofix dispatch failed for board {}: {}", boardId, e.getMessage());
            }
        }
    }

    /**
     * 매 5분 — 콜백이 오지 않은 작업을 회수한다.
     * 이게 없으면 러너가 죽었을 때 DISPATCHED 하나가 그 보드의 큐를 영구히 막는다.
     */
    @Scheduled(cron = "0 */5 * * * *")
    public void sweepStale() {
        if (!properties.isSchedulerEnabled()) return;
        try {
            queueService.sweepStaleDispatches();
        } catch (Exception e) {
            log.warn("Autofix stale sweep failed: {}", e.getMessage());
        }
    }
}
