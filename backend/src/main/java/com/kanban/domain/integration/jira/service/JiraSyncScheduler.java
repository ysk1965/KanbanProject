package com.kanban.domain.integration.jira.service;

import com.kanban.domain.integration.jira.JiraIntegrationConfig;
import com.kanban.domain.integration.jira.JiraIntegrationConfigRepository;
import com.kanban.domain.integration.jira.dto.JiraRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * JIRA 동기화 스케줄러.
 *  · syncWriteBack — 완료 역동기화(백스톱, 2분).
 *  · pullSync — 블록↔status 매핑/미러 보드의 JIRA status 변화를 BRIDGE로 pull(검토중/완료/반려, 2분).
 * DailyStandupScheduler 패턴을 따른다. (웹훅 근실시간은 Phase 4에서 이 폴링을 백업으로 병행)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JiraSyncScheduler {

    private final JiraIntegrationConfigRepository configRepository;
    private final JiraWriteBackService writeBackService;
    private final JiraImportService importService;
    private final JiraMilestoneScopeService scopeService;

    /** 매 2분 실행. */
    @Scheduled(cron = "0 */2 * * * *")
    @SchedulerLock(name = "JiraSyncScheduler.syncWriteBack", lockAtMostFor = "4m", lockAtLeastFor = "30s")
    public void syncWriteBack() {
        List<JiraIntegrationConfig> configs = configRepository.findAllActiveWithWriteBack();
        if (configs.isEmpty()) return;

        for (JiraIntegrationConfig config : configs) {
            try {
                writeBackService.syncBoard(config.getId());
            } catch (Exception e) {
                log.warn("JIRA write-back sync failed for board {}: {}",
                    config.getBoard() != null ? config.getBoard().getId() : config.getId(), e.getMessage());
            }
        }
    }

    /**
     * 매 2분 pull 폴링 — 매핑된 보드의 JIRA 이슈를 재동기화(업서트)해 status 변화를 반영한다.
     * 업서트가 곧 pull이므로 재가져오기를 그대로 재사용(연결한 사용자를 행위자로).
     * write-back(2분)과 주기를 정렬. 웹훅 미설정 보드(미러 포함)의 백업 반영 지연을 줄인다.
     */
    @Scheduled(cron = "0 */2 * * * *")
    @SchedulerLock(name = "JiraSyncScheduler.pullSync", lockAtMostFor = "4m", lockAtLeastFor = "30s")
    public void pullSync() {
        List<JiraIntegrationConfig> configs = configRepository.findAllActivePollable();
        if (configs.isEmpty()) return;

        for (JiraIntegrationConfig config : configs) {
            String boardId = config.getBoard() != null ? config.getBoard().getId() : null;
            String actorId = config.getConnectedBy() != null ? config.getConnectedBy().getId() : null;
            if (boardId == null || actorId == null) continue;
            try {
                importService.importIssues(boardId, actorId, new JiraRequest.Import(null, false));
            } catch (Exception e) {
                log.warn("JIRA pull sync failed for board {}: {}", boardId, e.getMessage());
            }
            // 마일스톤 스코프 소속(claim) 갱신 — 본 동기화와 독립적으로 수렴(멱등, 스코프 없으면 no-op).
            try {
                scopeService.claimAllForBoard(boardId);
            } catch (Exception e) {
                log.warn("JIRA scope claim failed for board {}: {}", boardId, e.getMessage());
            }
        }
    }
}
