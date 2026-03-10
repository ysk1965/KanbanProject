package com.kanban.domain.integration.slack.service;

import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class SlackApiClient {

    private static final String SLACK_API_BASE = "https://slack.com/api";
    private static final int MAX_RETRIES = 3;

    private final RestTemplate restTemplate;

    /**
     * Exchange OAuth code for bot token
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> exchangeCode(String clientId, String clientSecret, String code, String redirectUri) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("client_id", clientId);
        body.add("client_secret", clientSecret);
        body.add("code", code);
        body.add("redirect_uri", redirectUri);

        HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(body, headers);
        ResponseEntity<Map> response = restTemplate.postForEntity(SLACK_API_BASE + "/oauth.v2.access", request, Map.class);

        Map<String, Object> responseBody = response.getBody();
        if (responseBody == null || !Boolean.TRUE.equals(responseBody.get("ok"))) {
            String error = responseBody != null ? String.valueOf(responseBody.get("error")) : "unknown";
            log.error("Slack OAuth exchange failed: {}", error);
            throw new BusinessException(ErrorCode.SLACK_OAUTH_FAILED);
        }
        return responseBody;
    }

    /**
     * Post a message to a Slack channel
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> postMessage(String botToken, String channelId, List<Map<String, Object>> blocks) {
        return postMessage(botToken, channelId, blocks, null);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> postMessage(String botToken, String channelId, List<Map<String, Object>> blocks, Map<String, Object> metadata) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("channel", channelId);
        body.put("blocks", blocks);
        if (metadata != null) {
            body.put("metadata", metadata);
        }
        return callSlackApi(botToken, "/chat.postMessage", body);
    }

    /**
     * List conversations (channels) the bot can see
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> listConversations(String botToken, String types, String cursor, int limit) {
        String url = SLACK_API_BASE + "/conversations.list?types=" + types + "&limit=" + limit + "&exclude_archived=true";
        if (cursor != null && !cursor.isBlank()) {
            url += "&cursor=" + cursor;
        }
        return callSlackApiGet(botToken, url);
    }

    /**
     * Test authentication
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> authTest(String botToken) {
        return callSlackApi(botToken, "/auth.test", Map.of());
    }

    /**
     * Open a DM conversation with a Slack user (for sending DMs via bot)
     */
    @SuppressWarnings("unchecked")
    public String conversationsOpen(String botToken, String slackUserId) {
        Map<String, Object> body = Map.of("users", slackUserId);
        Map<String, Object> response = callSlackApi(botToken, "/conversations.open", body);
        Map<String, Object> channel = (Map<String, Object>) response.get("channel");
        if (channel == null || channel.get("id") == null) {
            throw new BusinessException(ErrorCode.SLACK_API_ERROR);
        }
        return String.valueOf(channel.get("id"));
    }

    /**
     * Get user identity using a user OAuth token (identity.basic scope)
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> usersIdentity(String userToken) {
        return callSlackApiGet(userToken, SLACK_API_BASE + "/users.identity");
    }

    /**
     * Exchange OAuth code for user token (Sign in with Slack)
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> exchangeCodeForUserToken(String clientId, String clientSecret, String code, String redirectUri) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("client_id", clientId);
        body.add("client_secret", clientSecret);
        body.add("code", code);
        body.add("redirect_uri", redirectUri);

        HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(body, headers);
        ResponseEntity<Map> response = restTemplate.postForEntity(SLACK_API_BASE + "/oauth.v2.access", request, Map.class);

        Map<String, Object> responseBody = response.getBody();
        if (responseBody == null || !Boolean.TRUE.equals(responseBody.get("ok"))) {
            String error = responseBody != null ? String.valueOf(responseBody.get("error")) : "unknown";
            log.error("Slack user OAuth exchange failed: {}", error);
            throw new BusinessException(ErrorCode.SLACK_OAUTH_FAILED);
        }
        return responseBody;
    }

    /**
     * Revoke a token
     */
    @SuppressWarnings("unchecked")
    public void authRevoke(String botToken) {
        try {
            callSlackApi(botToken, "/auth.revoke", Map.of());
        } catch (Exception e) {
            log.warn("Failed to revoke Slack token: {}", e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> callSlackApi(String botToken, String method, Map<String, Object> body) {
        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                headers.setBearerAuth(botToken);

                HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
                ResponseEntity<Map> response = restTemplate.postForEntity(SLACK_API_BASE + method, request, Map.class);

                Map<String, Object> responseBody = response.getBody();
                if (responseBody != null && Boolean.TRUE.equals(responseBody.get("ok"))) {
                    return responseBody;
                }

                // Check for rate limiting
                if (response.getStatusCode().value() == 429) {
                    String retryAfter = response.getHeaders().getFirst("Retry-After");
                    long waitMs = retryAfter != null ? Long.parseLong(retryAfter) * 1000 : (long) Math.pow(2, attempt) * 1000;
                    log.warn("Slack API rate limited. Retrying after {}ms (attempt {})", waitMs, attempt + 1);
                    Thread.sleep(waitMs);
                    continue;
                }

                String error = responseBody != null ? String.valueOf(responseBody.get("error")) : "unknown";
                log.error("Slack API call to {} failed: {}", method, error);
                throw new BusinessException(ErrorCode.SLACK_API_ERROR);
            } catch (BusinessException e) {
                throw e;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new BusinessException(ErrorCode.SLACK_API_ERROR);
            } catch (Exception e) {
                if (attempt == MAX_RETRIES - 1) {
                    log.error("Slack API call to {} failed after {} retries: {}", method, MAX_RETRIES, e.getMessage());
                    throw new BusinessException(ErrorCode.SLACK_API_ERROR);
                }
                log.warn("Slack API call to {} failed (attempt {}): {}", method, attempt + 1, e.getMessage());
            }
        }
        throw new BusinessException(ErrorCode.SLACK_API_ERROR);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> callSlackApiGet(String botToken, String url) {
        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setBearerAuth(botToken);

                HttpEntity<Void> request = new HttpEntity<>(headers);
                ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.GET, request, Map.class);

                Map<String, Object> responseBody = response.getBody();
                if (responseBody != null && Boolean.TRUE.equals(responseBody.get("ok"))) {
                    return responseBody;
                }

                if (response.getStatusCode().value() == 429) {
                    String retryAfter = response.getHeaders().getFirst("Retry-After");
                    long waitMs = retryAfter != null ? Long.parseLong(retryAfter) * 1000 : (long) Math.pow(2, attempt) * 1000;
                    Thread.sleep(waitMs);
                    continue;
                }

                throw new BusinessException(ErrorCode.SLACK_API_ERROR);
            } catch (BusinessException e) {
                throw e;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new BusinessException(ErrorCode.SLACK_API_ERROR);
            } catch (Exception e) {
                if (attempt == MAX_RETRIES - 1) {
                    throw new BusinessException(ErrorCode.SLACK_API_ERROR);
                }
            }
        }
        throw new BusinessException(ErrorCode.SLACK_API_ERROR);
    }
}
