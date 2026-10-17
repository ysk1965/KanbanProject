package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * 담당자 push — BRIDGE에서 담당자를 바꾸면 JIRA 이슈의 담당자도 함께 옮긴다.
 *
 * <p>담당자는 BRIDGE가 JIRA로 밀어 넣는 <b>첫 번째 필드 값</b>이다(그 전까지 나가는 것은 상태 전환과
 * 댓글뿐이었다). 그래서 두 가지를 확실히 해 둔다.
 *
 * <ol>
 *   <li><b>JIRA에 계정이 없는 사람에게는 밀지 않는다.</b> 외주 인력이나 JIRA에 아예 없는 멤버에게
 *       배정했다고 JIRA를 미배정으로 밀어내면, 저쪽에서 일하던 담당자가 이유 없이 사라진다.
 *       이 경우 JIRA는 그대로 두고 BRIDGE 값만 살린다 — 기준선을 갱신하지 않으므로
 *       {@code JiraImportService}의 pull도 이 카드를 되돌리지 않는다.</li>
 *   <li><b>push 직후 기준선을 갱신한다.</b> 갱신하지 않으면 2분 뒤 폴링이 방금 우리가 만든 변경을
 *       "JIRA가 움직였다"고 읽고 그대로 되받아친다(에코).</li>
 * </ol>
 *
 * <p>대상은 원장이 지목한 담당 항목 하나뿐이다({@link JiraAssigneeChecklist}). 한 이슈의 담당자는
 * 한 명인데 카드의 체크리스트는 여럿이라, 나머지 항목까지 이슈 담당자를 대표한다고 보면
 * 마지막에 만진 항목이 이슈를 가져가 버린다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JiraAssigneeSyncService {

    private final JiraIntegrationConfigRepository configRepository;
    private final JiraIssueLinkRepository issueLinkRepository;
    private final JiraUserMappingRepository userMappingRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final BoardRepository boardRepository;
    private final JiraApiClient jiraApiClient;
    private final JiraOAuthService oauthService;

    /**
     * 담당자 변경 push. JIRA 미연동/미대상 항목이면 조용히 no-op.
     * {@code JiraPushListener}가 커밋 후 비동기로 호출한다.
     */
    @Transactional
    public void pushAssignee(String boardId, String taskId, String itemId) {
        JiraIntegrationConfig config = configRepository.findActiveByBoardId(boardId).orElse(null);
        if (config == null) return;

        JiraIssueLink link = issueLinkRepository
            .findByTargetTypeAndTargetId(JiraLinkTargetType.TASK, taskId).orElse(null);
        if (link == null) return;             // JIRA 연동 카드 아님
        if (link.isJiraDeleted()) return;     // JIRA에서 삭제된 이슈 — 넘길 곳이 없다

        ChecklistItem item = checklistItemRepository.findById(itemId).orElse(null);
        if (item == null) return;                              // 그 사이 지워짐
        if (!JiraAssigneeChecklist.isOwned(item, link)) return;   // 이슈 담당자를 대표하는 항목이 아님

        User assignee = item.getAssignee();
        String accountId = null;
        String displayName = null;

        if (assignee != null) {
            JiraUserMapping mapping = resolveMapping(boardId, config, assignee);
            if (mapping == null) {
                // JIRA에 대응 계정이 없는 사람 → JIRA 담당자는 기존 값 유지.
                // 기준선을 건드리지 않는 것이 곧 "pull이 이 카드를 되돌리지 않는다"는 뜻이다.
                log.info("JIRA assignee push 생략 ({}): {} 의 JIRA 계정을 찾지 못함 — JIRA 담당자 유지",
                    link.getJiraIssueKey(), assignee.getName());
                return;
            }
            accountId = mapping.getJiraAccountId();
            displayName = mapping.getJiraDisplayName() != null
                ? mapping.getJiraDisplayName() : assignee.getName();
        } else if (item.getContractor() != null) {
            // 외주 인력에게는 JIRA 계정이 없다 — 미배정으로 밀어내지 않는다(위와 같은 이유).
            log.info("JIRA assignee push 생략 ({}): 외주 배정 — JIRA 담당자 유지", link.getJiraIssueKey());
            return;
        }
        // 여기까지 왔는데 accountId가 null이면 "사람이 담당자를 비웠다" — 그건 그대로 JIRA에 반영한다.

        if (!link.jiraAssigneeChanged(accountId)) return;   // 이미 그 값 (에코이거나 제자리)

        try {
            String token = oauthService.resolveToken(config);
            jiraApiClient.assignIssue(JiraAuthContext.of(config, token), link.getJiraIssueKey(), accountId);
            link.applyAssignee(accountId);   // 에코 방지 + 기준선 갱신

            // 제목이 아직 기본 형태일 때만 표시명을 맞춘다. 사람이 이슈 제목으로 바꿔 쓰는 항목의
            // 이름을 담당자 바뀔 때마다 "담당: OOO"으로 되돌리면 팀이 붙인 이름이 사라진다.
            if (JiraAssigneeChecklist.hasPrefix(item)) {
                item.updateTitle(JiraAssigneeChecklist.titleFor(displayName));
            }

            log.info("JIRA assignee push: task {} → {} ({})",
                taskId, displayName != null ? displayName : "미배정", link.getJiraIssueKey());
        } catch (Exception e) {
            log.warn("JIRA assignee push failed for {}: {}", link.getJiraIssueKey(), e.getMessage());
            config.markError("담당자 push 실패: " + link.getJiraIssueKey());
        }
    }

    /**
     * BRIDGE 멤버 → JIRA 계정.
     *
     * <p>원장(jira_user_mappings)은 "JIRA에서 담당자로 등장한 적 있는 사람"만 담기 때문에,
     * 보드에서 처음 배정받는 팀원은 거기 없다. 원장에 없으면 JIRA에 직접 물어보고(이메일 → 이름 순),
     * 찾으면 원장에 남겨 다음부터는 조회 없이 해결한다.
     */
    private JiraUserMapping resolveMapping(String boardId, JiraIntegrationConfig config, User user) {
        JiraUserMapping stored = userMappingRepository.findByBoardIdAndBridgeUserId(boardId, user.getId())
            .stream()
            .filter(m -> m.getJiraAccountId() != null)
            .findFirst()
            .orElse(null);
        if (stored != null) return stored;

        return lookupInJira(boardId, config, user);
    }

    /** JIRA에 배정 가능한 사용자로 등록돼 있는지 조회. 확실할 때만(정확히 한 명) 인정한다. */
    private JiraUserMapping lookupInJira(String boardId, JiraIntegrationConfig config, User user) {
        String projectKey = config.getProjectKey();
        if (projectKey == null || projectKey.isBlank()) return null;

        try {
            String token = oauthService.resolveToken(config);
            JiraAuthContext ctx = JiraAuthContext.of(config, token);

            // 이메일이 이름보다 훨씬 안전하다(동명이인이 없다). 다만 Atlassian이 이메일을 가리는
            // 조직이 많아 응답에 안 실릴 수 있어, 못 찾으면 표시명 완전일치로 한 번 더 본다.
            JsonNode candidate = firstExactMatch(
                jiraApiClient.searchAssignableUsers(ctx, projectKey, user.getEmail()),
                node -> user.getEmail().equalsIgnoreCase(node.path("emailAddress").asText(null)));
            if (candidate == null && user.getName() != null && !user.getName().isBlank()) {
                candidate = firstExactMatch(
                    jiraApiClient.searchAssignableUsers(ctx, projectKey, user.getName()),
                    node -> user.getName().equalsIgnoreCase(node.path("displayName").asText(null)));
            }
            if (candidate == null) return null;

            String accountId = candidate.path("accountId").asText(null);
            if (accountId == null) return null;
            String displayName = candidate.path("displayName").asText(null);

            // 같은 accountId 행이 이미 있으면(담당자로 등장했지만 멤버와 안 이어진 상태) 그 행을 잇는다.
            JiraUserMapping existing = userMappingRepository
                .findByBoardIdAndJiraAccountId(boardId, accountId).orElse(null);
            if (existing != null) {
                existing.updateMapping(user, displayName);
                log.info("JIRA 사용자 매핑 연결: {} ↔ {} ({})", user.getName(), displayName, accountId);
                return existing;
            }

            Board board = boardRepository.findById(boardId).orElse(null);
            if (board == null) return null;
            JiraUserMapping created = userMappingRepository.save(JiraUserMapping.builder()
                .board(board)
                .jiraAccountId(accountId)
                .jiraDisplayName(displayName)
                .bridgeUser(user)
                .build());
            log.info("JIRA 사용자 매핑 생성: {} ↔ {} ({})", user.getName(), displayName, accountId);
            return created;

        } catch (Exception e) {
            log.warn("JIRA 사용자 조회 실패 ({}): {}", user.getName(), e.getMessage());
            return null;
        }
    }

    /**
     * 후보 중 판정식을 만족하는 사람이 <b>정확히 한 명</b>일 때만 그 사람을 준다.
     * 둘 이상이면 누구인지 모르는 것이고, 잘못 고르면 남의 이슈에 담당자를 꽂는다.
     */
    private JsonNode firstExactMatch(JsonNode users, java.util.function.Predicate<JsonNode> matches) {
        if (users == null || !users.isArray()) return null;
        List<JsonNode> hits = new ArrayList<>();
        for (JsonNode u : users) {
            if (u.path("active").asBoolean(true) && matches.test(u)) hits.add(u);
        }
        return hits.size() == 1 ? hits.get(0) : null;
    }
}
