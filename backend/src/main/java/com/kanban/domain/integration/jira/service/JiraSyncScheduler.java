package com.kanban.domain.integration.jira.service;

import com.kanban.domain.integration.jira.JiraIntegrationConfig;
import com.kanban.domain.integration.jira.JiraIntegrationConfigRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 완료 역동기화 스케줄러 — write-back 활성 보드를 주기적으로 훑어
 * 완료된 Task를 JIRA로 넘긴다(백스톱). DailyStandupScheduler 패턴을 따른다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JiraSyncScheduler {

    private final JiraIntegrationConfigRepository configRepository;
    private final JiraWriteBackService writeBackService;

    /** 매 2분 실행. */
    @Scheduled(cron = "0 */2 * * * *")
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
}
