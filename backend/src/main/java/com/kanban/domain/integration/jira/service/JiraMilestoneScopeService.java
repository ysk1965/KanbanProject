package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.integration.jira.dto.JiraResponse;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * 마일스톤별 JIRA 스코프 관리 + 소속(claim) 동기화.
 *
 * <p>스코프는 조회 범위(JQL)만 담는다 — 자격증명·웹훅은 보드 레벨
 * {@link JiraIntegrationConfig}가 그대로 갖는다. 스코프가 하나도 없으면 기존 동작(보드 전체)이다.
 *
 * <p><b>claim 패스.</b> 스코프 JQL로 이슈 키를 조회해 {@code jira_issue_links.scope_id}를 갱신한다.
 *  · JQL에 걸리는 링크: 소속이 비었으면 이 스코프로 지정(다른 스코프 소속이면 빼앗지 않음 — 선점 유지).
 *  · 더는 걸리지 않는 링크: 이 스코프 소속이면 보드 기본(null)으로 반납.
 *  · 검색이 페이지 상한에 잘렸으면 반납을 건너뛴다 — 잘린 목록으로 반납하면 멀쩡한 소속을 지운다.
 * 패스는 멱등이라 저장 직후·폴링·재동기화 어디서 몇 번을 돌려도 같은 결과로 수렴한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JiraMilestoneScopeService {

    private static final int PAGE_SIZE = 100;
    private static final int MAX_PAGES = 50;

    private final JiraApiClient jiraApiClient;
    private final JiraOAuthService oauthService;
    private final JiraIntegrationConfigRepository configRepository;
    private final JiraMilestoneScopeRepository scopeRepository;
    private final JiraIssueLinkRepository issueLinkRepository;
    private final MilestoneRepository milestoneRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;

    // ── 조회 ──────────────────────────────────────

    @Transactional(readOnly = true)
    public List<JiraResponse.MilestoneScope> getScopes(String boardId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);
        return scopeRepository.findByBoardId(boardId).stream()
            .map(this::toDto)
            .toList();
    }

    // ── 저장/삭제 ─────────────────────────────────

    /**
     * 스코프 업서트 + 즉시 claim. JQL이 잘못됐으면 JIRA 검색이 실패해 저장 전에 튕긴다 —
     * 저장은 됐는데 화면이 비는 "조용한 오타"를 만들지 않기 위해 검증과 저장을 한 호출로 묶는다.
     */
    @Transactional
    public JiraResponse.MilestoneScope saveScope(String boardId, String milestoneId, String userId, String jql) {
        boardService.checkAdminOrAbove(boardId, userId);
        if (jql == null || jql.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        JiraIntegrationConfig config = configRepository.findActiveByBoardId(boardId)
            .orElseThrow(() -> new BusinessException(ErrorCode.JIRA_NOT_CONFIGURED));
        Milestone milestone = milestoneRepository.findById(milestoneId)
            .orElseThrow(() -> new BusinessException(ErrorCode.MILESTONE_NOT_FOUND));
        if (!milestone.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
        }

        JiraMilestoneScope scope = scopeRepository.findByMilestoneId(milestoneId).orElse(null);
        if (scope == null) {
            User creator = userRepository.findById(userId).orElse(null);
            scope = scopeRepository.save(JiraMilestoneScope.builder()
                .board(milestone.getBoard())
                .milestone(milestone)
                .jql(jql.trim())
                .createdBy(creator)
                .build());
        } else {
            scope.updateJql(jql.trim());
        }

        int claimed = claimScope(config, scope); // JQL 오류면 여기서 throw → 롤백
        return toDto(scope, claimed);
    }

    /** 스코프 삭제 — 소속 링크는 보드 기본(null)으로 반납한다. Task·이슈 링크 자체는 보존. */
    @Transactional
    public void deleteScope(String boardId, String milestoneId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        scopeRepository.findByMilestoneId(milestoneId).ifPresent(scope -> {
            if (!scope.getBoard().getId().equals(boardId)) {
                throw new BusinessException(ErrorCode.MILESTONE_NOT_FOUND);
            }
            issueLinkRepository.clearScope(scope.getId());
            scopeRepository.delete(scope);
        });
    }

    // ── claim 동기화 ──────────────────────────────

    /**
     * 보드의 활성 스코프 전부 claim. 폴링/재동기화 직후에 부른다.
     * 스코프 하나의 실패(JQL 오류 등)가 다른 스코프·본 동기화를 막지 않도록 개별로 삼킨다.
     */
    @Transactional
    public void claimAllForBoard(String boardId) {
        List<JiraMilestoneScope> scopes = scopeRepository.findActiveByBoardId(boardId);
        if (scopes.isEmpty()) return;
        JiraIntegrationConfig config = configRepository.findActiveByBoardId(boardId).orElse(null);
        if (config == null) return;
        for (JiraMilestoneScope scope : scopes) {
            try {
                claimScope(config, scope);
            } catch (Exception e) {
                log.warn("JIRA scope claim failed for board {} milestone {}: {}",
                    boardId, scope.getMilestone().getId(), e.getMessage());
            }
        }
    }

    /** 단일 스코프 claim. 반환값 = 현재 이 스코프 소속 링크 수. */
    private int claimScope(JiraIntegrationConfig config, JiraMilestoneScope scope) {
        String token = oauthService.resolveToken(config);
        JiraAuthContext ctx = JiraAuthContext.of(config, token);

        KeySearch search = fetchKeys(ctx, scope.getJql());
        String boardId = scope.getBoard().getId();
        List<JiraIssueLink> links = issueLinkRepository
            .findByBoardIdAndTargetType(boardId, JiraLinkTargetType.TASK);

        int claimed = 0;
        for (JiraIssueLink link : links) {
            boolean matches = search.keys.contains(link.getJiraIssueKey());
            if (matches) {
                if (link.getScopeId() == null) {
                    link.assignScope(scope.getId()); // 선점 유지 — 다른 스코프 소속은 빼앗지 않는다
                }
                if (scope.getId().equals(link.getScopeId())) claimed++;
            } else if (scope.getId().equals(link.getScopeId()) && !search.truncated) {
                link.assignScope(null); // 더는 JQL에 안 걸림 → 보드 기본으로 반납
            }
        }
        scope.markClaimed();
        return claimed;
    }

    private KeySearch fetchKeys(JiraAuthContext ctx, String jql) {
        Set<String> keys = new HashSet<>();
        String nextPageToken = null;
        boolean truncated = false;
        for (int page = 0; page < MAX_PAGES; page++) {
            JsonNode result = jiraApiClient.searchIssueKeys(ctx, jql, nextPageToken, PAGE_SIZE);
            JsonNode issuesNode = result != null ? result.get("issues") : null;
            if (issuesNode != null && issuesNode.isArray()) {
                for (JsonNode issue : issuesNode) {
                    JsonNode keyNode = issue.get("key");
                    if (keyNode != null && !keyNode.isNull()) keys.add(keyNode.asText());
                }
            }
            JsonNode tokenNode = result != null ? result.get("nextPageToken") : null;
            if (tokenNode == null || tokenNode.isNull() || tokenNode.asText().isBlank()) {
                return new KeySearch(keys, false);
            }
            nextPageToken = tokenNode.asText();
            truncated = true; // 다음 페이지가 남은 채 루프가 끝나면 잘린 것
        }
        return new KeySearch(keys, truncated);
    }

    private record KeySearch(Set<String> keys, boolean truncated) {}

    // ── DTO ───────────────────────────────────────

    private JiraResponse.MilestoneScope toDto(JiraMilestoneScope scope) {
        long count = issueLinkRepository
            .findByBoardIdAndTargetTypeAndScopeId(scope.getBoard().getId(), JiraLinkTargetType.TASK, scope.getId())
            .size();
        return toDto(scope, (int) count);
    }

    private JiraResponse.MilestoneScope toDto(JiraMilestoneScope scope, int claimedCount) {
        return JiraResponse.MilestoneScope.builder()
            .milestoneId(scope.getMilestone().getId())
            .jql(scope.getJql())
            .active(Boolean.TRUE.equals(scope.getActive()))
            .claimedCount(claimedCount)
            .lastClaimedAt(scope.getLastClaimedAt())
            .build();
    }
}
