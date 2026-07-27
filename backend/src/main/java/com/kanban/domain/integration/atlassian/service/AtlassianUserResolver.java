package com.kanban.domain.integration.atlassian.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.integration.atlassian.AtlassianUserMapping;
import com.kanban.domain.integration.atlassian.AtlassianUserMapping.ResolvedBy;
import com.kanban.domain.integration.atlassian.AtlassianUserMappingRepository;
import com.kanban.domain.integration.confluence.dto.ConfluenceResponse;
import com.kanban.domain.integration.confluence.service.ConfluenceApiClient;
import com.kanban.domain.integration.jira.JiraUserMapping;
import com.kanban.domain.integration.jira.JiraUserMappingRepository;
import com.kanban.domain.user.User;
import com.kanban.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Confluence 문서의 {@code accountId}를 <b>사람</b>으로 바꾼다.
 *
 * <p>방향이 핵심이다. {@code accountId → 이메일}은 Atlassian 프라이버시 정책에 막혀 대개 빈 값이
 * 오지만, {@code 이메일 → accountId}(사용자 검색)는 열려 있다. 그래서 우리가 이미 가진 <b>멤버
 * 이메일</b>을 질의로 넣어 계정을 찾고, 그 결과를 표에 적재해 다음부터는 DB만 본다.
 *
 * <p>해결 사다리 — 위에서 걸리면 아래로 안 내려간다:
 * <ol>
 *   <li><b>캐시</b> — {@code atlassian_user_mappings}에 이미 있는 계정</li>
 *   <li><b>JIRA 승격</b> — {@code jira_user_mappings}에 이어진 계정. accountId는 두 제품이 공유한다</li>
 *   <li><b>이메일 검색</b> — 멤버 이메일로 계정을 찾는다. 가장 정확해서 동명이인에도 안전하다</li>
 *   <li><b>표시 이름</b> — 그래도 안 되면 계정의 표시 이름을 받아 멤버 이름과 맞춰 본다</li>
 * </ol>
 *
 * <p>끝까지 멤버로 못 이어도 표시 이름은 남겨 보고서에 사람 이름이 보이게 하고, 그 계정도 표에
 * 적재한다 — 같은 외부 편집자를 매일 다시 조회하지 않기 위해서다. <b>모르는 계정이 새로 나타날
 * 때만</b> 외부 호출이 일어난다.
 *
 * <p>어느 단계가 실패해도 예외를 올리지 않는다. 작성자 이름을 못 붙이는 것은 보고서 수집 전체를
 * 실패시킬 이유가 아니다(스코프가 모자란 기존 연결이 대표적인 경우다).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AtlassianUserResolver {

    /** 한 번의 수집에서 이메일 검색을 시도할 멤버 수 상한 — 대형 보드에서 호출이 폭주하지 않게 막는다. */
    private static final int MAX_EMAIL_LOOKUPS = 30;
    /** 표시 이름을 조회할 미해결 계정 수 상한 */
    private static final int MAX_NAME_LOOKUPS = 50;

    private final AtlassianUserMappingRepository mappingRepository;
    private final JiraUserMappingRepository jiraMappingRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final BoardRepository boardRepository;
    private final ConfluenceApiClient apiClient;

    /**
     * 해석 결과 한 건.
     *
     * @param name   보고서에 표시할 이름. 멤버로 이어졌으면 BRIDGE 이름, 아니면 Atlassian 표시 이름.
     *               둘 다 모르면 null — 이때 호출부는 <b>accountId를 대신 노출하지 않는다</b>.
     * @param userId 이어진 BRIDGE 멤버의 userId. 못 이었으면 null(구성원 집계에서 제외).
     */
    public record ResolvedUser(String name, String userId) {
    }

    /**
     * accountId 목록을 사람으로 해석한다. 못 푼 계정은 결과 맵에 담기지 않는다.
     *
     * @param cloudId 사이트 식별자. null이면 외부 조회 없이 캐시만으로 해석한다.
     * @param token   OAuth 액세스 토큰. null이면 외부 조회 없이 캐시만으로 해석한다.
     */
    public Map<String, ResolvedUser> resolve(String boardId, String cloudId, String token,
                                             Collection<String> accountIds) {
        Set<String> wanted = new LinkedHashSet<>();
        for (String id : accountIds != null ? accountIds : List.<String>of()) {
            if (id != null && !id.isBlank()) {
                wanted.add(id);
            }
        }
        if (wanted.isEmpty()) {
            return Map.of();
        }

        try {
            return doResolve(boardId, cloudId, token, wanted);
        } catch (Exception e) {
            log.warn("Atlassian 사용자 해석 실패 board={} — 작성자 이름 없이 진행: {}", boardId, e.getMessage());
            return Map.of();
        }
    }

    private Map<String, ResolvedUser> doResolve(String boardId, String cloudId, String token,
                                                Set<String> wanted) {
        // 1) 캐시 — 보드 매핑을 한 번에 읽는다(문서마다 조회하면 N+1).
        Map<String, AtlassianUserMapping> byAccount = new HashMap<>();
        for (AtlassianUserMapping m : mappingRepository.findAllByBoardId(boardId)) {
            byAccount.put(m.getAccountId(), m);
        }

        Set<String> missing = new LinkedHashSet<>(wanted);
        missing.removeAll(byAccount.keySet());

        // 모르는 계정이 하나도 없으면 외부 호출 없이 끝낸다 — 평상시의 경로다.
        if (!missing.isEmpty()) {
            // 새 행을 만들 때 붙일 보드. 프록시가 아니라 실체를 쓴다 — 저장이 트랜잭션 밖에서
            // 일어나므로 프록시를 넘기면 초기화할 세션이 없다.
            Board board = boardRepository.findById(boardId).orElse(null);
            if (board == null) {
                return toResult(wanted, byAccount);
            }
            List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
            List<AtlassianUserMapping> dirty = new ArrayList<>();

            promoteFromJira(boardId, board, byAccount, missing, dirty);
            try {
                if (!missing.isEmpty() && cloudId != null && token != null) {
                    seedByMemberEmail(board, cloudId, token, members, byAccount, missing, dirty);
                }
                if (!missing.isEmpty() && cloudId != null && token != null) {
                    resolveByDisplayName(board, cloudId, token, members, byAccount, missing, dirty);
                }
            } catch (BusinessException e) {
                // 사용자 조회 스코프가 없는 기존 연결 — 계정마다 재시도해 봐야 전부 같은 결과다.
                // 여기서 끊고, 그때까지 이어진 것만 저장한다. 해당 보드에서 Confluence를 다시
                // 연결하면 동의가 갱신돼 다음 수집부터 이름이 붙는다.
                log.warn("Confluence 사용자 조회 권한 없음 board={} — 작성자 이름 매칭을 건너뛴다. "
                        + "재연결이 필요하다: {}", boardId, e.getMessage());
            }

            if (!dirty.isEmpty()) {
                mappingRepository.saveAll(dirty);
            }
        }

        return toResult(wanted, byAccount);
    }

    /** 해석 결과를 결과 맵으로. 이름조차 모르는 계정은 담지 않는다. */
    private Map<String, ResolvedUser> toResult(Set<String> wanted,
                                               Map<String, AtlassianUserMapping> byAccount) {
        Map<String, ResolvedUser> result = new LinkedHashMap<>();
        for (String accountId : wanted) {
            AtlassianUserMapping mapping = byAccount.get(accountId);
            if (mapping == null) {
                continue;
            }
            User user = mapping.getBridgeUser();
            String name = user != null && user.getName() != null && !user.getName().isBlank()
                    ? user.getName()
                    : mapping.getDisplayName();
            if (name == null || name.isBlank()) {
                continue; // 이름을 모르면 accountId를 대신 보여주지 않는다 — 그게 원래 문제였다
            }
            result.put(accountId, new ResolvedUser(name, user != null ? user.getId() : null));
        }
        return result;
    }

    // ── 2) JIRA 매핑 승격 ────────────────────────────────────

    /** 같은 보드의 JIRA 매핑에 이미 이어진 계정이면 그대로 가져온다. 외부 호출이 필요 없다. */
    private void promoteFromJira(String boardId, Board board,
                                 Map<String, AtlassianUserMapping> byAccount,
                                 Set<String> missing, List<AtlassianUserMapping> dirty) {
        List<JiraUserMapping> linked;
        try {
            linked = jiraMappingRepository.findLinkedByBoardId(boardId);
        } catch (Exception e) {
            log.warn("JIRA 매핑 조회 실패 board={}: {}", boardId, e.getMessage());
            return;
        }
        for (JiraUserMapping jira : linked) {
            String accountId = jira.getJiraAccountId();
            if (!missing.contains(accountId)) {
                continue;
            }
            upsert(board, byAccount, dirty, accountId,
                    jira.getBridgeUser(), jira.getJiraDisplayName(), ResolvedBy.JIRA);
            missing.remove(accountId);
        }
    }

    // ── 3) 멤버 이메일 → 계정 검색 ───────────────────────────

    /**
     * 아직 계정이 안 붙은 멤버를 이메일로 찾아 매핑을 만든다. 가장 정확한 경로다.
     *
     * <p>모르는 계정이 있을 때만 돈다. 멤버 한 명당 검색 1회이고, 결과는 표에 남으므로
     * 같은 멤버를 다시 찾지 않는다. Atlassian 계정이 없는 멤버는 행이 안 생겨 다음에 또
     * 시도되지만, 새 계정이 나타날 때만이라 빈도가 낮다.
     */
    private void seedByMemberEmail(Board board, String cloudId, String token,
                                   List<BoardMember> members,
                                   Map<String, AtlassianUserMapping> byAccount,
                                   Set<String> missing, List<AtlassianUserMapping> dirty) {
        // 이미 계정이 붙은 멤버는 건너뛴다.
        Set<String> linkedUserIds = new java.util.HashSet<>();
        for (AtlassianUserMapping m : byAccount.values()) {
            if (m.getBridgeUser() != null) {
                linkedUserIds.add(m.getBridgeUser().getId());
            }
        }

        int lookups = 0;
        for (BoardMember member : members) {
            if (missing.isEmpty() || lookups >= MAX_EMAIL_LOOKUPS) {
                break;
            }
            User user = member.getUser();
            if (user == null || linkedUserIds.contains(user.getId())) {
                continue;
            }
            String email = user.getEmail();
            if (email == null || email.isBlank()) {
                continue;
            }

            lookups++;
            List<ConfluenceResponse.UserRef> found = apiClient.searchUsers(cloudId, token, email);
            ConfluenceResponse.UserRef match = pickByEmail(found, email);
            if (match == null) {
                continue;
            }
            upsert(board, byAccount, dirty, match.getAccountId(),
                    user, match.getDisplayName(), ResolvedBy.EMAIL);
            linkedUserIds.add(user.getId());
            missing.remove(match.getAccountId());
        }
    }

    /**
     * 검색 결과에서 그 이메일의 계정을 고른다.
     *
     * <p>응답에 이메일이 실려 있으면 정확히 일치하는 것을 고르고, 없으면(프라이버시로 가려진
     * 흔한 경우) <b>결과가 정확히 1건일 때만</b> 받아들인다. 여러 건인데 확증이 없으면 포기한다 —
     * 엉뚱한 사람 이름이 보고서에 박히는 것보다 이름이 없는 편이 낫다.
     */
    private ConfluenceResponse.UserRef pickByEmail(List<ConfluenceResponse.UserRef> found, String email) {
        if (found == null || found.isEmpty()) {
            return null;
        }
        for (ConfluenceResponse.UserRef ref : found) {
            if (ref.getEmail() != null && ref.getEmail().equalsIgnoreCase(email)) {
                return ref;
            }
        }
        return found.size() == 1 ? found.get(0) : null;
    }

    // ── 4) 표시 이름 조회 + 이름 일치 ────────────────────────

    /**
     * 남은 계정의 표시 이름을 받아 온다. 멤버 이름과 같으면 이어 주고, 아니면 이름만 남긴다
     * (외부 편집자도 보고서에는 사람 이름으로 보여야 한다).
     */
    private void resolveByDisplayName(Board board, String cloudId, String token,
                                      List<BoardMember> members,
                                      Map<String, AtlassianUserMapping> byAccount,
                                      Set<String> missing, List<AtlassianUserMapping> dirty) {
        List<String> targets = missing.stream().limit(MAX_NAME_LOOKUPS).toList();
        List<ConfluenceResponse.UserRef> users = apiClient.fetchUsers(cloudId, token, targets);
        if (users.isEmpty()) {
            return;
        }

        Map<String, User> byNormalizedName = new HashMap<>();
        for (BoardMember member : members) {
            User user = member.getUser();
            String key = normalizeName(user != null ? user.getName() : null);
            if (key != null) {
                // 같은 이름이 둘이면 이름 매칭은 신뢰할 수 없다 — 후보에서 뺀다.
                byNormalizedName.merge(key, user, (a, b) -> null);
            }
        }

        for (ConfluenceResponse.UserRef ref : users) {
            String displayName = ref.getDisplayName();
            User matched = byNormalizedName.get(normalizeName(displayName));
            upsert(board, byAccount, dirty, ref.getAccountId(), matched, displayName,
                    matched != null ? ResolvedBy.DISPLAY_NAME : ResolvedBy.UNRESOLVED);
            missing.remove(ref.getAccountId());
        }
    }

    /** 이름 비교용 정규화 — 공백 제거 + 소문자. 한글은 대소문자가 없어 공백 차이만 흡수된다. */
    private String normalizeName(String name) {
        if (name == null) {
            return null;
        }
        String normalized = name.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
        return normalized.isEmpty() ? null : normalized;
    }

    // ── 공통 ────────────────────────────────────────────────

    /** 계정 행을 만들거나 갱신한다. 같은 계정이 이미 있으면 새 근거로 다시 잇는다. */
    private void upsert(Board board, Map<String, AtlassianUserMapping> byAccount,
                        List<AtlassianUserMapping> dirty, String accountId,
                        User bridgeUser, String displayName, ResolvedBy resolvedBy) {
        if (accountId == null || accountId.isBlank()) {
            return;
        }
        AtlassianUserMapping existing = byAccount.get(accountId);
        if (existing != null) {
            existing.relink(bridgeUser, displayName, resolvedBy);
            dirty.add(existing);
            return;
        }
        AtlassianUserMapping created = AtlassianUserMapping.builder()
                .board(board)
                .accountId(accountId)
                .displayName(displayName)
                .bridgeUser(bridgeUser)
                .resolvedBy(resolvedBy)
                .build();
        byAccount.put(accountId, created);
        dirty.add(created);
    }
}
