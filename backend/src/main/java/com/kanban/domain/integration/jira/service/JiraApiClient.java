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
 * JIRA Cloud REST v3 클라이언트. API 토큰(Basic)과 OAuth(Bearer) 모두 지원 — {@link JiraAuthContext}로 분기.
 *
 * 순수 전송 계층. 응답은 Jackson {@link JsonNode}. 성공 판정은 HTTP status(2xx).
 * SlackApiClient의 재시도·백오프·BusinessException 변환 골격 차용.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JiraApiClient {

    private static final int MAX_RETRIES = 3;

    private static final List<String> DEFAULT_FIELDS = List.of(
        "summary", "description", "status", "issuetype", "priority",
        "labels", "components", "assignee", "reporter", "parent",
        "created", "updated", "attachment", "project");

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    // ── 연결 검증 ──────────────────────────────────

    public JsonNode getMyself(JiraAuthContext ctx) {
        return exchange(ctx, HttpMethod.GET, "/myself", null);
    }

    public JsonNode getProject(JiraAuthContext ctx, String projectKey) {
        return exchange(ctx, HttpMethod.GET, "/project/" + projectKey, null);
    }

    public JsonNode getProjectStatuses(JiraAuthContext ctx, String projectKey) {
        return exchange(ctx, HttpMethod.GET, "/project/" + projectKey + "/statuses", null);
    }

    // ── Agile 보드 (컬럼 구성 = 사용자가 보는 칸반 컬럼) ──

    /** 프로젝트에 연결된 Agile 보드 목록. /rest/agile/1.0/board?projectKeyOrId= */
    public JsonNode getAgileBoards(JiraAuthContext ctx, String projectKey) {
        return exchangeUrl(ctx, HttpMethod.GET,
            agileBase(ctx) + "/board?projectKeyOrId=" + projectKey + "&maxResults=50", null);
    }

    /** 보드 컬럼 구성 — columnConfig.columns[].{name, statuses[].id}. 각 컬럼에 묶인 JIRA 상태들. */
    public JsonNode getBoardConfiguration(JiraAuthContext ctx, String boardId) {
        return exchangeUrl(ctx, HttpMethod.GET,
            agileBase(ctx) + "/board/" + boardId + "/configuration", null);
    }

    // ── 이슈 검색 (Enhanced JQL search, nextPageToken 페이지네이션) ──

    public JsonNode searchIssues(JiraAuthContext ctx, String jql, String nextPageToken, int maxResults) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("jql", jql);
        body.put("maxResults", maxResults);
        ArrayNode fields = body.putArray("fields");
        DEFAULT_FIELDS.forEach(fields::add);
        if (nextPageToken != null && !nextPageToken.isBlank()) {
            body.put("nextPageToken", nextPageToken);
        }
        return exchange(ctx, HttpMethod.POST, "/search/jql", body);
    }

    public JsonNode getIssue(JiraAuthContext ctx, String issueKey) {
        String path = "/issue/" + issueKey + "?fields=" + String.join(",", DEFAULT_FIELDS) + ",comment";
        return exchange(ctx, HttpMethod.GET, path, null);
    }

    // ── 전환 (완료 역동기화) ───────────────────────

    public JsonNode getTransitions(JiraAuthContext ctx, String issueKey) {
        return exchange(ctx, HttpMethod.GET, "/issue/" + issueKey + "/transitions", null);
    }

    public void transitionIssue(JiraAuthContext ctx, String issueKey, String transitionId) {
        ObjectNode body = objectMapper.createObjectNode();
        body.putObject("transition").put("id", transitionId);
        exchange(ctx, HttpMethod.POST, "/issue/" + issueKey + "/transitions", body);
    }

    // ── 첨부 다운로드 (content URL은 절대경로) ────

    public byte[] downloadAttachment(JiraAuthContext ctx, String contentUrl) {
        HttpEntity<Void> request = new HttpEntity<>(authHeaders(ctx));
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

    private JsonNode exchange(JiraAuthContext ctx, HttpMethod method, String path, JsonNode body) {
        return exchangeUrl(ctx, method, apiBase(ctx) + path, body);
    }

    private JsonNode exchangeUrl(JiraAuthContext ctx, HttpMethod method, String url, JsonNode body) {
        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                HttpHeaders headers = authHeaders(ctx);
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
                    // 진단: Atlassian이 401/403 시 응답 본문/WWW-Authenticate에 "필요한 스코프"를 담아줌.
                    String wwwAuth = e.getResponseHeaders() != null
                        ? e.getResponseHeaders().getFirst("WWW-Authenticate") : null;
                    log.warn("JIRA {} {} → {} | body={} | WWW-Authenticate={}",
                        method, url, code, e.getResponseBodyAsString(), wwwAuth);
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
                log.error("JIRA API call {} {} failed: {} {}", method, url, code, e.getMessage());
                throw new BusinessException(ErrorCode.JIRA_API_ERROR);

            } catch (BusinessException e) {
                throw e;
            } catch (Exception e) {
                if (attempt == MAX_RETRIES - 1) {
                    log.error("JIRA API call {} {} failed after {} retries: {}", method, url, MAX_RETRIES, e.getMessage());
                    throw new BusinessException(ErrorCode.JIRA_API_ERROR);
                }
                log.warn("JIRA API call {} {} failed (attempt {}): {}", method, url, attempt + 1, e.getMessage());
            }
        }
        throw new BusinessException(ErrorCode.JIRA_API_ERROR);
    }

    private HttpHeaders authHeaders(JiraAuthContext ctx) {
        HttpHeaders headers = new HttpHeaders();
        if (ctx.isOAuth()) {
            headers.setBearerAuth(ctx.token());
        } else {
            String creds = ctx.email() + ":" + ctx.token();
            String encoded = Base64.getEncoder().encodeToString(creds.getBytes(StandardCharsets.UTF_8));
            headers.set(HttpHeaders.AUTHORIZATION, "Basic " + encoded);
        }
        return headers;
    }

    private String apiBase(JiraAuthContext ctx) {
        if (ctx.isOAuth()) {
            return "https://api.atlassian.com/ex/jira/" + ctx.cloudId() + "/rest/api/3";
        }
        String host = ctx.baseUrl().trim().replaceFirst("^https?://", "").replaceAll("/+$", "");
        return "https://" + host + "/rest/api/3";
    }

    /** Agile(Jira Software) API 베이스. 보드 컬럼 구성 등. */
    private String agileBase(JiraAuthContext ctx) {
        if (ctx.isOAuth()) {
            return "https://api.atlassian.com/ex/jira/" + ctx.cloudId() + "/rest/agile/1.0";
        }
        String host = ctx.baseUrl().trim().replaceFirst("^https?://", "").replaceAll("/+$", "");
        return "https://" + host + "/rest/agile/1.0";
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
