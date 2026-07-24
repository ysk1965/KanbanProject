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
    private static final int SEARCH_LIMIT = 25;
    /** 스페이스 목록 페이지네이션 상한 (100개/페이지 × 10 = 1000개) */
    private static final int SPACE_PAGE_GUARD = 10;

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
     */
    public List<ConfluenceResponse.PageRef> searchPages(String cloudId, String token, String cql) {
        String url = UriComponentsBuilder.fromUriString(base(cloudId) + "/wiki/rest/api/search")
                .queryParam("cql", cql)
                .queryParam("limit", SEARCH_LIMIT)
                .build()
                .encode()
                .toUriString();

        JsonNode body = get(url, token);
        List<ConfluenceResponse.PageRef> pages = new ArrayList<>();
        for (JsonNode node : body.path("results")) {
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
        return pages;
    }

    /** 페이지 본문(storage 포맷 HTML). 변환은 {@link ConfluenceStorageConverter}가 맡는다. */
    public String getPageStorageBody(String cloudId, String token, String pageId) {
        // v2 pages. body-format=storage 를 빼면 body가 {}로 와서 본문이 사라지므로 필수.
        String url = base(cloudId) + "/wiki/api/v2/pages/" + pageId + "?body-format=storage";
        JsonNode body = get(url, token);
        return body.path("body").path("storage").path("value").asText(null);
    }

    private String base(String cloudId) {
        return API_BASE + "/ex/confluence/" + cloudId;
    }

    private JsonNode get(String url, String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));

        try {
            ResponseEntity<JsonNode> response = restTemplate.exchange(
                    url, HttpMethod.GET, new HttpEntity<>(headers), JsonNode.class);
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
