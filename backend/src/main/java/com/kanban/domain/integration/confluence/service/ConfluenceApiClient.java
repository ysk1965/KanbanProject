package com.kanban.domain.integration.confluence.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.integration.confluence.dto.ConfluenceResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

/**
 * Confluence Cloud REST 호출.
 *
 * <p>스페이스 목록·본문 조회는 v2({@code /wiki/api/v2/*})를 쓴다. v1의
 * {@code /wiki/rest/api/space}·{@code /content}는 제거되어 410 Gone을 반환하기 때문이다.
 *
 * <p>검색만은 CQL이 필요해 v1({@code /wiki/rest/api/search})을 쓴다. v2에는 CQL 검색 대체가
 * 없어 Atlassian이 이 엔드포인트를 존치했다("그 주에 올라온 주간보고 페이지"를 라벨·부모·제목으로 찾는 길).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ConfluenceApiClient {

    private static final String API_BASE = "https://api.atlassian.com";
    /** 검색 페이지당 결과 수 */
    private static final int SEARCH_LIMIT = 100;
    /** 검색 페이지네이션 상한 (100개/페이지 × 5 = 500개) — 변경 많은 주에 25개에서 잘리는 것을 막는다 */
    private static final int SEARCH_PAGE_GUARD = 5;
    /** 스페이스 목록 페이지네이션 상한 (100개/페이지 × 10 = 1000개) */
    private static final int SPACE_PAGE_GUARD = 10;
    /** 하위 트리 조회 페이지네이션 상한 (250개/페이지 × 8 = 2000개) */
    private static final int DESCENDANT_PAGE_GUARD = 8;
    /** 사용자 검색 결과 상한 — 사내 도메인 이메일이면 1건이면 충분하나, 동명 확인용 여유를 둔다 */
    private static final int USER_SEARCH_LIMIT = 5;
    /** 사용자 벌크 조회 1회 상한 (Atlassian 제한과 동일) */
    private static final int USER_BULK_LIMIT = 200;

    private final RestTemplate restTemplate;

    public List<ConfluenceResponse.SpaceRef> listSpaces(String cloudId, String token) {
        // v2 spaces. 응답은 v1과 동일하게 results[]에 key/name/type가 그대로 실린다.
        // 사이트에 스페이스가 100개를 넘을 수 있어 _links.next 커서를 따라 끝까지 모은다
        // (최대 SPACE_PAGE_GUARD 페이지 = 1000개 상한 — 무한 루프 방지).
        List<ConfluenceResponse.SpaceRef> spaces = new ArrayList<>();
        String url = base(cloudId) + "/wiki/api/v2/spaces?limit=100&status=current";
        for (int page = 0; url != null && page < SPACE_PAGE_GUARD; page++) {
            JsonNode body = get(url, token);
            for (JsonNode node : body.path("results")) {
                spaces.add(ConfluenceResponse.SpaceRef.builder()
                        .key(node.path("key").asText())
                        .name(node.path("name").asText())
                        .type(node.path("type").asText(null))
                        .build());
            }
            // v2의 next는 사이트 상대 경로(예: /wiki/api/v2/spaces?cursor=...). base를 붙여 절대 URL로.
            String next = body.path("_links").path("next").asText(null);
            url = (next != null && !next.isBlank()) ? base(cloudId) + next : null;
        }
        return spaces;
    }

    /**
     * CQL로 페이지를 찾는다. 기간은 호출부가 만든 CQL 조각에 이미 들어 있다.
     *
     * <p>{@code start} 커서로 끝까지 따라가되 {@link #SEARCH_PAGE_GUARD}로 막는다(최대 500건).
     * 단일 호출·25개 컷이던 옛 동작은 변경이 많은 주에 오래된 변경분을 소리 없이 잘라냈다.
     * 2페이지 이후 조회가 실패하면 그때까지 모은 것을 반환한다(전량 손실 방지).
     */
    public List<ConfluenceResponse.PageRef> searchPages(String cloudId, String token, String cql) {
        List<ConfluenceResponse.PageRef> pages = new ArrayList<>();
        int start = 0;
        for (int page = 0; page < SEARCH_PAGE_GUARD; page++) {
            String url = UriComponentsBuilder.fromUriString(base(cloudId) + "/wiki/rest/api/search")
                    .queryParam("cql", cql)
                    .queryParam("limit", SEARCH_LIMIT)
                    .queryParam("start", start)
                    .build()
                    .encode()
                    .toUriString();

            JsonNode body;
            try {
                body = get(url, token);
            } catch (RuntimeException e) {
                if (page == 0) {
                    throw e; // 첫 페이지 실패는 실제 조회 실패 — 위로 전파
                }
                log.warn("Confluence 검색 페이지네이션 중단 start={}: {}", start, e.getMessage());
                break;
            }

            JsonNode results = body.path("results");
            for (JsonNode node : results) {
                JsonNode content = node.path("content");
                String id = content.path("id").asText(null);
                if (id == null) {
                    continue;
                }
                pages.add(ConfluenceResponse.PageRef.builder()
                        .id(id)
                        .title(content.path("title").asText(node.path("title").asText("")))
                        .url(node.path("url").asText(null))
                        .lastUpdated(node.path("lastModified").asText(null))
                        .build());
            }

            // 서버가 limit을 낮춰 잡을 수 있어 요청값이 아니라 실제 반환 수로 다음 start를 잡고,
            // 더 있는지는 응답의 _links.next 유무로 판단한다(빈 페이지도 종료).
            int pageSize = results.size();
            boolean hasNext = !body.path("_links").path("next").asText("").isBlank();
            if (pageSize == 0 || !hasNext) {
                break;
            }
            start += pageSize;
        }
        return pages;
    }

    /**
     * 부모 페이지 하위 <b>트리 전체</b>의 현재 페이지 목록(id·title). 삭제 감지의 기준선이 되므로
     * 변경 여부와 무관하게 전부 모은다. 커서로 끝까지 따라가되 {@link #DESCENDANT_PAGE_GUARD}로 막는다.
     */
    public List<ConfluenceResponse.PageRef> listDescendants(String cloudId, String token, String parentPageId) {
        List<ConfluenceResponse.PageRef> pages = new ArrayList<>();
        // depth 미지정 = 트리 전체 후손(엔드포인트 기본). 상태/타입은 아래에서 코드로 거른다.
        String url = base(cloudId) + "/wiki/api/v2/pages/" + parentPageId
                + "/descendants?limit=250";
        for (int page = 0; url != null && page < DESCENDANT_PAGE_GUARD; page++) {
            JsonNode body = get(url, token);
            for (JsonNode node : body.path("results")) {
                // 페이지만 (댓글/첨부 등 다른 타입 제외), 현재 상태만.
                if (!"page".equals(node.path("type").asText(null))) {
                    continue;
                }
                if (node.has("status") && !"current".equals(node.path("status").asText(null))) {
                    continue;
                }
                String id = node.path("id").asText(null);
                if (id == null) {
                    continue;
                }
                pages.add(ConfluenceResponse.PageRef.builder()
                        .id(id)
                        .title(node.path("title").asText(""))
                        .build());
            }
            String next = body.path("_links").path("next").asText(null);
            url = (next != null && !next.isBlank()) ? base(cloudId) + next : null;
        }
        return pages;
    }

    /**
     * 추가/수정 분류와 본문 수집에 필요한 페이지 상세를 한 번에 가져온다.
     * ({@code createdAt} · {@code version} · {@code body.storage})
     */
    public ConfluenceResponse.PageDetail getPageDetail(String cloudId, String token, String pageId) {
        String url = base(cloudId) + "/wiki/api/v2/pages/" + pageId + "?body-format=storage";
        JsonNode body = get(url, token);
        JsonNode version = body.path("version");
        return ConfluenceResponse.PageDetail.builder()
                .id(body.path("id").asText(pageId))
                .title(body.path("title").asText(""))
                .createdAt(body.path("createdAt").asText(null))
                .versionNumber(version.path("number").isMissingNode() ? null : version.path("number").asInt())
                .versionCreatedAt(version.path("createdAt").asText(null))
                .authorId(version.path("authorId").asText(body.path("authorId").asText(null)))
                .storageBody(body.path("body").path("storage").path("value").asText(null))
                .webUrl(body.path("_links").path("webui").asText(null))
                .build();
    }

    // ── 사용자 조회 ──────────────────────────────────────────
    //
    // 문서 작성자는 accountId로만 오므로 사람 이름으로 바꿔야 한다. 방향이 중요하다:
    // accountId → 이메일은 Atlassian 프라이버시 정책에 막혀 대개 빈 값이 오지만,
    // 이메일 → accountId(검색)는 열려 있다. 그래서 멤버 이메일을 질의로 넣어 계정을 찾는다.

    /**
     * 이메일(또는 이름)로 사용자를 찾는다. 사내 도메인 이메일이면 보통 정확히 1건이 나온다.
     *
     * <p>실패해도 예외를 올리지 않고 빈 목록을 준다 — 작성자 이름을 못 붙이는 건 보고서 전체를
     * 실패시킬 이유가 아니다. 스코프가 모자라면 여기서 401/403이 나므로 경고 로그로 남긴다.
     */
    public List<ConfluenceResponse.UserRef> searchUsers(String cloudId, String token, String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        String cql = "user~\"" + query.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
        String url = UriComponentsBuilder.fromUriString(base(cloudId) + "/wiki/rest/api/search/user")
                .queryParam("cql", cql)
                .queryParam("limit", USER_SEARCH_LIMIT)
                .build()
                .encode()
                .toUriString();

        JsonNode body;
        try {
            body = get(url, token);
        } catch (RuntimeException e) {
            rethrowIfAuthFailure(e); // 스코프 부족이면 남은 계정도 어차피 실패한다 — 즉시 중단시킨다
            log.warn("Confluence 사용자 검색 실패 query={}: {} — 작성자 이름 매칭을 건너뛴다",
                    query, e.getMessage());
            return List.of();
        }

        List<ConfluenceResponse.UserRef> users = new ArrayList<>();
        for (JsonNode node : body.path("results")) {
            // 검색 응답은 results[].user 에 사용자를 싣는다. 형태가 바뀌어도 최상위를 한 번 더 본다.
            JsonNode user = node.has("user") ? node.path("user") : node;
            String accountId = user.path("accountId").asText(null);
            if (accountId == null || accountId.isBlank()) {
                continue;
            }
            users.add(ConfluenceResponse.UserRef.builder()
                    .accountId(accountId)
                    .displayName(firstNonBlank(user.path("displayName").asText(null),
                                               user.path("publicName").asText(null)))
                    .email(blankToNull(user.path("email").asText(null)))
                    .build());
        }
        return users;
    }

    /**
     * accountId 여러 개의 표시 이름을 한 번에 가져온다. 이메일로 못 이은 계정(외부 편집자 등)도
     * 최소한 이름은 보이게 하는 마지막 수단이다.
     *
     * <p>bulk 엔드포인트가 막혀 있으면 계정별 단건 조회로 물러난다. 그마저 실패하면 그 계정만 건너뛴다.
     */
    public List<ConfluenceResponse.UserRef> fetchUsers(String cloudId, String token,
                                                       List<String> accountIds) {
        if (accountIds == null || accountIds.isEmpty()) {
            return List.of();
        }
        List<String> distinct = accountIds.stream()
                .filter(id -> id != null && !id.isBlank())
                .distinct()
                .limit(USER_BULK_LIMIT)
                .toList();
        if (distinct.isEmpty()) {
            return List.of();
        }

        UriComponentsBuilder builder =
                UriComponentsBuilder.fromUriString(base(cloudId) + "/wiki/rest/api/user/bulk");
        distinct.forEach(id -> builder.queryParam("accountId", id));
        try {
            JsonNode body = get(builder.build().encode().toUriString(), token);
            List<ConfluenceResponse.UserRef> users = new ArrayList<>();
            for (JsonNode node : body.path("results")) {
                ConfluenceResponse.UserRef ref = toUserRef(node);
                if (ref != null) {
                    users.add(ref);
                }
            }
            if (!users.isEmpty()) {
                return users;
            }
        } catch (RuntimeException e) {
            rethrowIfAuthFailure(e);
            log.warn("Confluence 사용자 벌크 조회 실패({}건) — 단건 조회로 물러난다: {}",
                    distinct.size(), e.getMessage());
        }
        return fetchUsersOneByOne(cloudId, token, distinct);
    }

    private List<ConfluenceResponse.UserRef> fetchUsersOneByOne(String cloudId, String token,
                                                                List<String> accountIds) {
        List<ConfluenceResponse.UserRef> users = new ArrayList<>();
        for (String accountId : accountIds) {
            String url = UriComponentsBuilder.fromUriString(base(cloudId) + "/wiki/rest/api/user")
                    .queryParam("accountId", accountId)
                    .build()
                    .encode()
                    .toUriString();
            try {
                ConfluenceResponse.UserRef ref = toUserRef(get(url, token));
                if (ref != null) {
                    users.add(ref);
                }
            } catch (RuntimeException e) {
                rethrowIfAuthFailure(e);
                log.warn("Confluence 사용자 조회 실패 accountId={}: {}", accountId, e.getMessage());
            }
        }
        return users;
    }

    private ConfluenceResponse.UserRef toUserRef(JsonNode node) {
        String accountId = node.path("accountId").asText(null);
        if (accountId == null || accountId.isBlank()) {
            return null;
        }
        return ConfluenceResponse.UserRef.builder()
                .accountId(accountId)
                .displayName(firstNonBlank(node.path("displayName").asText(null),
                                           node.path("publicName").asText(null)))
                .email(blankToNull(node.path("email").asText(null)))
                .build();
    }

    /**
     * 인증·권한 실패는 삼키지 않고 올린다.
     *
     * <p>사용자 조회 스코프는 나중에 추가돼서, 그 전에 연결한 보드의 토큰에는 없다. 이때 계정마다
     * 조용히 재시도하면 한 번의 수집에서 수십 번 헛호출이 나간다. 첫 실패에서 끊어 호출부가
     * 사람 이름 매칭 자체를 건너뛰게 한다.
     */
    private void rethrowIfAuthFailure(RuntimeException e) {
        if (e instanceof BusinessException be && be.getErrorCode() == ErrorCode.CONFLUENCE_AUTH_FAILED) {
            throw be;
        }
    }

    private String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) return a;
        return (b != null && !b.isBlank()) ? b : null;
    }

    private String blankToNull(String value) {
        return (value != null && !value.isBlank()) ? value : null;
    }

    private String base(String cloudId) {
        return API_BASE + "/ex/confluence/" + cloudId;
    }

    private JsonNode get(String url, String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));

        try {
            // url은 이미 UriComponentsBuilder.encode()로 인코딩돼 있다. String 오버로드로 넘기면
            // RestTemplate(TEMPLATE_AND_VALUES)이 %22 등을 %2522로 재인코딩해 검색 CQL이 깨진다.
            // URI 객체로 넘겨 재인코딩을 차단한다(build(true) = 이미 인코딩됨).
            URI uri = UriComponentsBuilder.fromUriString(url).build(true).toUri();
            ResponseEntity<JsonNode> response = restTemplate.exchange(
                    uri, HttpMethod.GET, new HttpEntity<>(headers), JsonNode.class);
            JsonNode body = response.getBody();
            if (body == null) {
                throw new BusinessException(ErrorCode.CONFLUENCE_API_ERROR, "응답이 비어 있습니다");
            }
            return body;
        } catch (HttpStatusCodeException e) {
            int status = e.getStatusCode().value();
            log.warn("Confluence API 실패 url={} status={} body={}",
                    url, status, e.getResponseBodyAsString());
            if (status == 401) {
                throw new BusinessException(ErrorCode.CONFLUENCE_AUTH_FAILED);
            }
            if (status == 403) {
                throw new BusinessException(ErrorCode.CONFLUENCE_AUTH_FAILED,
                        "이 스페이스를 읽을 권한이 없습니다");
            }
            if (status == 404) {
                // 사이트는 맞는데 Confluence가 없거나, 페이지가 지워진 경우
                throw new BusinessException(ErrorCode.CONFLUENCE_NOT_FOUND);
            }
            if (status == 429) {
                throw new BusinessException(ErrorCode.CONFLUENCE_API_ERROR,
                        "호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요");
            }
            throw new BusinessException(ErrorCode.CONFLUENCE_API_ERROR);
        }
    }
}
