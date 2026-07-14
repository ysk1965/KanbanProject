package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.integration.slack.service.SlackTokenEncryptor;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 완료 역동기화 — BRIDGE Task가 완료되면 연결된 JIRA 이슈를 설정된 상태(기본 "3. 작업 완료")로 전환.
 *
 * getTransitions로 목표 status로 가는 전환을 매번 동적 조회(전환 id는 현재 상태에 따라 달라짐),
 * writeBackDoneAt로 멱등 처리. 개별 이슈 실패는 삼키고 다음으로 진행.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JiraWriteBackService {

    private final JiraIntegrationConfigRepository configRepository;
    private final JiraIssueLinkRepository issueLinkRepository;
    private final TaskRepository taskRepository;
    private final JiraApiClient jiraApiClient;
    private final SlackTokenEncryptor tokenEncryptor;

    /** 한 보드의 완료 역동기화. 스케줄러가 configId로 호출 → 각자 트랜잭션에서 재로딩. */
    @Transactional
    public int syncBoard(String configId) {
        JiraIntegrationConfig config = configRepository.findById(configId).orElse(null);
        if (config == null || !Boolean.TRUE.equals(config.getActive())
            || !Boolean.TRUE.equals(config.getWriteBackEnabled())
            || config.getWriteBackTargetStatusId() == null) {
            return 0;
        }

        String token = tokenEncryptor.decrypt(config.getApiTokenEncrypted());
        String boardId = config.getBoard().getId();
        List<JiraIssueLink> candidates =
            issueLinkRepository.findWriteBackCandidates(boardId, JiraLinkTargetType.TASK);

        int done = 0;
        for (JiraIssueLink link : candidates) {
            Task task = taskRepository.findById(link.getTargetId()).orElse(null);
            if (task == null || !Boolean.TRUE.equals(task.getIsCompleted())) {
                continue; // 삭제됐거나 아직 미완료 → 다음 기회에
            }
            try {
                transitionToTarget(config, token, link.getJiraIssueKey(), config.getWriteBackTargetStatusId());
                link.markWriteBackDone();
                done++;
            } catch (Exception e) {
                log.warn("JIRA write-back failed for {}: {}", link.getJiraIssueKey(), e.getMessage());
                config.markError("역동기화 실패: " + link.getJiraIssueKey());
            }
        }
        if (done > 0) {
            log.info("JIRA write-back: board {} transitioned {} issue(s)", boardId, done);
        }
        return done;
    }

    /** 목표 status로 가는 전환을 찾아 실행. 없으면(이미 대상 상태/전환 불가) 조용히 통과. */
    private void transitionToTarget(JiraIntegrationConfig config, String token, String issueKey, String targetStatusId) {
        JsonNode result = jiraApiClient.getTransitions(config.getBaseUrl(), config.getAccountEmail(), token, issueKey);
        JsonNode transitions = result != null ? result.get("transitions") : null;

        String transitionId = null;
        if (transitions != null && transitions.isArray()) {
            for (JsonNode tr : transitions) {
                if (targetStatusId.equals(tr.path("to").path("id").asText(null))) {
                    transitionId = tr.path("id").asText(null);
                    break;
                }
            }
        }
        if (transitionId == null) {
            log.info("No transition to status {} available for {} — assuming already there", targetStatusId, issueKey);
            return;
        }
        jiraApiClient.transitionIssue(config.getBaseUrl(), config.getAccountEmail(), token, issueKey, transitionId);
    }
}
