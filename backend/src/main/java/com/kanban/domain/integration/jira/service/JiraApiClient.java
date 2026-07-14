package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

/**
 * JIRA Cloud REST v3 클라이언트 (API 토큰 Basic 인증).
 *
 * 순수 전송 계층 — 자격증명(email, 복호화 토큰)과 baseUrl을 인자로 받아 stateless.
 * 응답은 Jackson {@link JsonNode}로 반환하고, 파싱은 Mapper/Service가 담당.
 * SlackApiClient의 재시도·백오프·BusinessException 변환 골격을 차용하되
 * 성공 판정은 HTTP status(2xx)로 한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JiraApiClient {

    private static final int MAX_RETRIES = 3;

    private static final List<String> DEFAULT_FIELDS = List.of(
        "summary", "description", "status", "issuetype", "priority",
        "labels", "components", "assignee", "reporter", "parent",
        "created", "updated", "attachment");

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    // ── 연결 검증 ──────────────────────────────────

    /** GET /myself — 200이면 자격증명 유효. 401/403이면 JIRA_AUTH_FAILED. */
    public JsonNode getMyself(String baseUrl, String email, String token) {
        return exchange(baseUrl, email, token, HttpMethod.GET, "/myself", null);
    }

    /** GET /project/{key} — 프로젝트 존재/접근 검증 및 메타. */
    public JsonNode getProject(String baseUrl, String email, String token, String projectKey) {
        return exchange(baseUrl, email, token, HttpMethod.GET, "/project/" + projectKey, null);
    }

    /** GET /project/{key}/statuses — 상태 목록(매핑 UI용). */
    public JsonNode getProjectStatuses(String baseUrl, String email, String token, String projectKey) {
        return exchange(baseUrl, email, token, HttpMethod.GET, "/project/" + projectKey + "/statuses", null);
    }

    // ── 이슈 검색 (Enhanced JQL search, nextPageToken 페이지네이션) ──

    /**
     * POST /search/jql — JQL 결과 한 페이지. nextPageToken이 null이면 마지막.
     * @param nextPageToken 첫 호출 시 null.
     */
    public JsonNode searchIssues(String baseUrl, String email, String token,
                                 String jql, String nextPageToken, int maxResults) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("jql", jql);
        body.put("maxResults", maxResults);
        ArrayNode fields = body.putArray("fields");
        DEFAULT_FIELDS.forEach(fields::add);
        if (nextPageToken != null && !nextPageToken.isBlank()) {
            body.put("nextPageToken", nextPageToken);
        }
        return exchange(baseUrl, email, token, HttpMethod.POST, "/search/jql", body);
    }

    /** GET /issue/{key}?fields=...&expand=... — 단건 상세(댓글 포함). */
    public JsonNode getIssue(String baseUrl, String email, String token, String issueKey) {
        String path = "/issue/" + issueKey + "?fields="
            + String.join(",", DEFAULT_FIELDS) + ",comment";
        return exchange(baseUrl, email, token, HttpMethod.GET, path, null);
    }

    // ── 전환 (완료 역동기화) ───────────────────────

    /** GET /issue/{key}/transitions — 현재 상태에서 가능한 전환 목록. */
    public JsonNode getTransitions(String baseUrl, String email, String token, String issueKey) {
        return exchange(baseUrl, email, token, HttpMethod.GET, "/issue/" + issueKey + "/transitions", null);
    }

    /** POST /issue/{key}/transitions — 전환 실행. */
    public void transitionIssue(String baseUrl, String email, String token, String issueKey, String transitionId) {
        ObjectNode body = objectMapper.createObjectNode();
        ObjectNode transition = body.putObject("transition");
        transition.put("id", transitionId);
        exchange(baseUrl, email, token, HttpMethod.POST, "/issue/" + issueKey + "/transitions", body);
    }

    // ── 첨부 다운로드 ──────────────────────────────

    /** 첨부 content URL(절대 경로)에서 바이트를 내려받는다. */
    public byte[] downloadAttachment(String contentUrl, String email, String token) {
        HttpHeaders headers = basicAuthHeaders(email, token);
        HttpEntity<Void> request = new HttpEntity<>(headers);
        try {
            ResponseEntity<byte[]> response = restTemplate.exchange(contentUrl, HttpMethod.GET, request, byte[].class);
            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                throw new BusinessException(ErrorCode.JIRA_API_ERROR);
            }
            return response.getBody();
        } catch (HttpClientErrorException e) {
            log.warn("JIRA attachment download failed: {} {}", e.getStatusCode(), contentUrl);
            throw new BusinessException(ErrorCode.JIRA_API_ERROR);
        }
    }

    // ── 공통 호출 ──────────────────────────────────

    private JsonNode exchange(String baseUrl, String email, String token,
                              HttpMethod method, String path, JsonNode body) {
        String url = apiBase(baseUrl) + path;
        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                HttpHeaders headers = basicAuthHeaders(email, token);
                headers.setContentType(MediaType.APPLICATION_JSON);
                headers.setAccept(List.of(MediaType.APPLICATION_JSON));

                HttpEntity<JsonNode> request = new HttpEntity<>(body, headers);
                ResponseEntity<JsonNode> response = restTemplate.exchange(url, method, request, JsonNode.class);

                if (response.getStatusCode().is2xxSuccessful()) {
                    return response.getBody();
                }
                throw new BusinessException(ErrorCode.JIRA_API_ERROR);

            } catch (HttpClientErrorException e) {
                int code = e.getStatusCode().value();
                if (code == 401 || code == 403) {
                    throw new BusinessException(ErrorCode.JIRA_AUTH_FAILED);
                }
                if (code == 404) {
                    throw new BusinessException(ErrorCode.JIRA_ISSUE_NOT_FOUND);
                }
                if (code == 429) {
                    String retryAfter = e.getResponseHeaders() != null ? e.getResponseHeaders().getFirst("Retry-After") : null;
                    long waitMs = retryAfter != null ? Long.parseLong(retryAfter) * 1000 : (long) Math.pow(2, attempt) * 1000;
                    log.warn("JIRA API rate limited. Retrying after {}ms (attempt {})", waitMs, attempt + 1);
                    sleep(waitMs);
                    continue;
                }
                log.error("JIRA API call {} {} failed: {} {}", method, path, code, e.getMessage());
                throw new BusinessException(ErrorCode.JIRA_API_ERROR);

            } catch (BusinessException e) {
                throw e;
            } catch (Exception e) {
                if (attempt == MAX_RETRIES - 1) {
                    log.error("JIRA API call {} {} failed after {} retries: {}", method, path, MAX_RETRIES, e.getMessage());
                    throw new BusinessException(ErrorCode.JIRA_API_ERROR);
                }
                log.warn("JIRA API call {} {} failed (attempt {}): {}", method, path, attempt + 1, e.getMessage());
            }
        }
        throw new BusinessException(ErrorCode.JIRA_API_ERROR);
    }

    private HttpHeaders basicAuthHeaders(String email, String token) {
        HttpHeaders headers = new HttpHeaders();
        String creds = email + ":" + token;
        String encoded = Base64.getEncoder().encodeToString(creds.getBytes(StandardCharsets.UTF_8));
        headers.set(HttpHeaders.AUTHORIZATION, "Basic " + encoded);
        return headers;
    }

    /** "cookapps-interactive.atlassian.net" 또는 "https://..." 모두 받아 REST v3 base로. */
    private String apiBase(String baseUrl) {
        String host = baseUrl.trim()
            .replaceFirst("^https?://", "")
            .replaceAll("/+$", "");
        return "https://" + host + "/rest/api/3";
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ErrorCode.JIRA_API_ERROR);
        }
    }
}
