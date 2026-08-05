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

    /**
     * 매 5분 — 소식이 끊긴 러너를 알린다.
     *
     * <p>{@link #sweepStale}과 분리한 이유: 회수는 <b>물고 있던 작업</b>을 풀어주는 일이고 이쪽은
     * <b>러너가 죽었다</b>는 사실을 알리는 일이다. 큐가 빈 채로 러너가 죽으면 회수는 아무것도
     * 하지 않으므로, 같은 메서드에 넣으면 정확히 그 경우에 침묵한다.
     *
     * <p>한쪽이 예외로 죽어도 다른 쪽은 돌아야 하므로 try도 따로 잡는다.
     */
    @Scheduled(cron = "30 */5 * * * *")
    public void alertOfflineRunners() {
        try {
            queueService.alertOfflineRunners();
        } catch (Exception e) {
            log.warn("Autofix runner offline alert failed: {}", e.getMessage());
        }
    }

    /**
     * 매 5분 — 살아 있는데 계약이 어긋난 러너를 알린다.
     *
     * <p>{@link #alertOfflineRunners}와 분리한 이유는 이 고장이 정확히 그 반대 조건이기 때문이다.
     * 저쪽은 <b>말이 끊긴</b> 러너를 찾고, 이쪽은 <b>말은 걸어오는데 아무것도 못 받는</b> 러너를
     * 찾는다. 한 메서드에 넣으면 조건이 서로를 배제해 한쪽이 반드시 침묵한다.
     *
     * <p>시각을 45초로 어긋나게 둔 것은 앞의 둘과 트랜잭션이 겹치지 않게 하기 위해서다.
     */
    @Scheduled(cron = "45 */5 * * * *")
    public void alertContractDrift() {
        try {
            queueService.alertContractDrift();
        } catch (Exception e) {
            log.warn("Autofix contract drift alert failed: {}", e.getMessage());
        }
    }
}
