package com.kanban.domain.integration.jira.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * 트리아지 백그라운드 실행기.
 *
 * <p>{@code @TransactionalEventListener}가 아니라 평범한 {@code @EventListener}다 — 시작 경로는
 * 트랜잭션 안에서 돌지 않으므로 커밋 이후를 기다리면 영영 실행되지 않는다. 진행률 행은 발행 전에
 * 이미 자기 트랜잭션으로 커밋돼 있다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JiraAutofixTriageListener {

    private final JiraAutofixTriageService triageService;

    @Async
    @EventListener
    public void onTriageRequested(JiraAutofixTriageRequestedEvent event) {
        // executeRun이 실패를 진행률 행에 적는다. 여기서 예외가 새면 아무도 못 본다
        triageService.executeRun(event.runId(), event.boardId(), event.userId(),
                event.force(), event.issueKeys());
    }
}
