package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.integration.jira.*;
import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 완료 역동기화 — BRIDGE Task가 완료되면 연결된 JIRA 이슈를 설정된 상태(기본 "3. 작업 완료")로 전환.
 *
 * getTransitions로 목표 status로 가는 전환을 매번 동적 조회(전환 id는 현재 상태에 따라 달라짐),
 * writeBackDoneAt로 멱등 처리. 개별 이슈 실패는 삼키고 다음으로 진행.
 *
 * <p>JIRA 호출(HTTP)은 트랜잭션 밖에서 한다. 트랜잭션 안에서 호출하면 응답을 기다리는 동안 DB 커넥션을
 * 쥐고 있어, 2분 스케줄러·카드 이동 push 가 몰릴 때 dev 풀(5개)이 고갈됐다(2026-11-16).
 * 그래서 "읽기 트랜잭션 → HTTP → 결과 기록 트랜잭션" 순서로 나눈다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JiraWriteBackService {

    /** 완료 여부 확인 시 IN 절 한 번에 넣을 id 수. */
    private static final int COMPLETED_CHECK_CHUNK = 500;

    private final JiraIntegrationConfigRepository configRepository;
    private final JiraIssueLinkRepository issueLinkRepository;
    private final JiraMilestoneScopeRepository scopeRepository;
    private final BlockRepository blockRepository;
    private final JiraApiClient jiraApiClient;
    private final JiraOAuthService oauthService;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;
    private final EntityManager entityManager;

    private record PushPlan(
            String configId, String linkId, String issueKey, List<String> targetStatuses, JiraAuthContext ctx) {}

    private record WriteBackItem(String linkId, String issueKey, String targetStatusId) {}

    private record WriteBackPlan(JiraAuthContext ctx, List<WriteBackItem> items) {}

    /**
     * 블록 이동 push (Phase 2) — 개발이 카드를 push 블록으로 옮기면 매핑된 JIRA status로 전환.
     * {@code JiraPushListener}가 커밋 후 비동기로 호출. JIRA 연동 카드가 아니거나 push 대상이 없으면 no-op.
     *
     * <p>루프 방지: push 대상은 개발 소유(dir=push) status라서 pull이 무시한다(소유권 분리 = 에코 차단).
     */
    public void pushBlockStatus(String boardId, String taskId, String targetBlockId) {
        PushPlan plan = transactionTemplate.execute(status -> planPush(boardId, taskId, targetBlockId));
        if (plan == null) return;

        String applied;
        try {
            applied = transitionToFirst(plan.ctx(), plan.issueKey(), plan.targetStatuses());
        } catch (Exception e) {
            log.warn("JIRA push failed for {}: {}", plan.issueKey(), e.getMessage());
            transactionTemplate.executeWithoutResult(status -> configRepository
                    .findById(plan.configId())
                    .ifPresent(c -> c.markError("push 실패: " + plan.issueKey())));
            return;
        }
        if (applied == null) return;

        transactionTemplate.executeWithoutResult(status -> issueLinkRepository
                .findById(plan.linkId())
                .ifPresent(link -> link.markJiraStatus(applied))); // 에코 방지 + pre-block 현재상태 갱신
        log.info("JIRA push: task {} → status {} ({})", taskId, applied, plan.issueKey());
    }

    /** push 대상 결정 + 토큰 확보(회전 refresh 토큰 저장 때문에 트랜잭션 안). 보낼 게 없으면 null. */
    private PushPlan planPush(String boardId, String taskId, String targetBlockId) {
        JiraIntegrationConfig config =
                configRepository.findActiveByBoardId(boardId).orElse(null);
        if (config == null) return null;

        // 대상 status 후보 결정: MIRROR면 대상 컬럼에 묶인 상태들(우선순위 순), MANUAL이면 블록별 push 매핑.
        List<String> targetStatuses = List.of();
        if (config.isMirror()) {
            MirrorColumns mirror = MirrorColumns.parse(objectMapper, config.getMirrorColumnsJson());
            targetStatuses = mirror.statusIdsForBlock(targetBlockId);
        } else if (config.getBlockStatusMapJson() != null) {
            BlockStatusMap map = BlockStatusMap.parse(objectMapper, config.getBlockStatusMapJson());
            String s = map.pushTargetForBlock(targetBlockId);
            targetStatuses = s != null ? List.of(s) : List.of();
        }
        // 마일스톤 스코프 소유 컬럼 확인 — 다른 프로젝트를 비추는 스코프의 미러 블록일 수 있다.
        if (targetStatuses.isEmpty()) {
            for (JiraMilestoneScope scope : scopeRepository.findActiveByBoardId(boardId)) {
                if (scope.getMirrorColumnsJson() == null) continue;
                List<String> ids = MirrorColumns.parse(objectMapper, scope.getMirrorColumnsJson())
                        .statusIdsForBlock(targetBlockId);
                if (!ids.isEmpty()) {
                    targetStatuses = ids;
                    break;
                }
            }
        }
        if (targetStatuses.isEmpty() && config.isMirror()) {
            Block tb = blockRepository.findById(targetBlockId).orElse(null);
            if (tb != null && tb.getJiraStatusId() != null) targetStatuses = List.of(tb.getJiraStatusId());
        }
        if (targetStatuses.isEmpty()) return null; // 미러 컬럼이 아니거나 push 매핑 아님

        JiraIssueLink link = issueLinkRepository
                .findByTargetTypeAndTargetId(JiraLinkTargetType.TASK, taskId)
                .orElse(null);
        if (link == null) return null; // JIRA 연동 카드 아님
        if (link.isJiraDeleted()) return null; // JIRA에서 삭제된 이슈 — 전환 대상 없음

        // 이미 이 컬럼의 상태 중 하나면 전환 불필요(제자리)
        if (link.getLastJiraStatusId() != null && targetStatuses.contains(link.getLastJiraStatusId())) return null;

        String token;
        try {
            token = oauthService.resolveToken(config);
        } catch (Exception e) {
            log.warn("JIRA push failed for {}: {}", link.getJiraIssueKey(), e.getMessage());
            config.markError("push 실패: " + link.getJiraIssueKey());
            return null;
        }
        return new PushPlan(
                config.getId(),
                link.getId(),
                link.getJiraIssueKey(),
                targetStatuses,
                JiraAuthContext.of(config, token));
    }

    /** 후보 상태들 중 전환 가능한 첫 상태로 전환. 실행한 상태 id 반환(없으면 null). */
    private String transitionToFirst(JiraAuthContext ctx, String issueKey, List<String> statusIds) {
        JsonNode result = jiraApiClient.getTransitions(ctx, issueKey);
        JsonNode transitions = result != null ? result.get("transitions") : null;
        if (transitions == null || !transitions.isArray()) return null;
        for (String target : statusIds) {
            for (JsonNode tr : transitions) {
                if (target.equals(tr.path("to").path("id").asText(null))) {
                    jiraApiClient.transitionIssue(ctx, issueKey, tr.path("id").asText(null));
                    return target;
                }
            }
        }
        return null;
    }

    /** 한 보드의 완료 역동기화. 스케줄러가 configId로 호출 → 단계마다 트랜잭션에서 재로딩. */
    public int syncBoard(String configId) {
        WriteBackPlan plan = transactionTemplate.execute(status -> planWriteBack(configId));
        if (plan == null || plan.items().isEmpty()) return 0;

        List<String> doneLinkIds = new ArrayList<>();
        String lastError = null;
        for (WriteBackItem item : plan.items()) {
            try {
                transitionToTarget(plan.ctx(), item.issueKey(), item.targetStatusId());
                doneLinkIds.add(item.linkId());
            } catch (Exception e) {
                log.warn("JIRA write-back failed for {}: {}", item.issueKey(), e.getMessage());
                lastError = "역동기화 실패: " + item.issueKey();
            }
        }

        String error = lastError;
        transactionTemplate.executeWithoutResult(status -> {
            for (JiraIssueLink link : issueLinkRepository.findAllById(doneLinkIds)) {
                link.markWriteBackDone();
            }
            if (error != null) {
                configRepository.findById(configId).ifPresent(c -> c.markError(error));
            }
        });
        if (!doneLinkIds.isEmpty()) {
            log.info("JIRA write-back: config {} transitioned {} issue(s)", configId, doneLinkIds.size());
        }
        return doneLinkIds.size();
    }

    /** 완료됐는데 아직 JIRA로 안 넘긴 링크와 각 대상 상태를 고른다. 보낼 게 없으면 null. */
    private WriteBackPlan planWriteBack(String configId) {
        JiraIntegrationConfig config = configRepository.findById(configId).orElse(null);
        if (config == null
                || !Boolean.TRUE.equals(config.getActive())
                || !Boolean.TRUE.equals(config.getWriteBackEnabled())) {
            return null;
        }
        String boardId = config.getBoard().getId();

        // 스코프별 대상 상태 — 프로젝트가 다르면 상태 id 체계도 달라 링크 소속대로 골라야 한다.
        Map<String, String> scopeTargets = new HashMap<>();
        for (JiraMilestoneScope scope : scopeRepository.findActiveByBoardId(boardId)) {
            if (scope.getWriteBackTargetStatusId() != null) {
                scopeTargets.put(scope.getId(), scope.getWriteBackTargetStatusId());
            }
        }
        if (config.getWriteBackTargetStatusId() == null && scopeTargets.isEmpty()) {
            return null; // 보낼 곳이 어디에도 없다
        }

        List<JiraIssueLink> candidates = issueLinkRepository.findWriteBackCandidates(boardId, JiraLinkTargetType.TASK);
        // 링크마다 Task 를 따로 읽던 N+1 대신, 완료된(삭제 안 된) Task id 만 한 번에 고른다.
        Set<String> completedTaskIds = findCompletedTaskIds(
                candidates.stream().map(JiraIssueLink::getTargetId).toList());

        List<WriteBackItem> items = new ArrayList<>();
        for (JiraIssueLink link : candidates) {
            if (!completedTaskIds.contains(link.getTargetId())) {
                continue; // 삭제됐거나 아직 미완료 → 다음 기회에
            }
            // 링크 소속 스코프의 대상 상태 우선, 없으면 보드 기본. 둘 다 없으면 이 링크는 보류.
            String target = link.getScopeId() != null && scopeTargets.containsKey(link.getScopeId())
                    ? scopeTargets.get(link.getScopeId())
                    : config.getWriteBackTargetStatusId();
            if (target == null) continue;
            items.add(new WriteBackItem(link.getId(), link.getJiraIssueKey(), target));
        }
        if (items.isEmpty()) return null;

        // 토큰은 보낼 게 있을 때만 확보 — OAuth 갱신이 일어나면 회전된 refresh 토큰이 이 트랜잭션에서 저장된다.
        String token = oauthService.resolveToken(config);
        return new WriteBackPlan(JiraAuthContext.of(config, token), items);
    }

    /** {@code @SQLRestriction("deleted_at IS NULL")} 이 JPQL 에도 적용돼 삭제된 Task 는 빠진다. */
    private Set<String> findCompletedTaskIds(List<String> taskIds) {
        Set<String> completed = new HashSet<>();
        if (taskIds.isEmpty()) return completed;
        List<String> all = new ArrayList<>(new HashSet<>(taskIds));
        for (int from = 0; from < all.size(); from += COMPLETED_CHECK_CHUNK) {
            List<String> chunk = all.subList(from, Math.min(from + COMPLETED_CHECK_CHUNK, all.size()));
            completed.addAll(entityManager
                    .createQuery("SELECT t.id FROM Task t WHERE t.id IN :ids AND t.isCompleted = true", String.class)
                    .setParameter("ids", chunk)
                    .getResultList());
        }
        return completed;
    }

    /** 목표 status로 가는 전환을 찾아 실행. 없으면(이미 대상 상태/전환 불가) 조용히 통과. */
    private void transitionToTarget(JiraAuthContext ctx, String issueKey, String targetStatusId) {
        JsonNode result = jiraApiClient.getTransitions(ctx, issueKey);
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
        jiraApiClient.transitionIssue(ctx, issueKey, transitionId);
    }
}
