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
     * Get a single conversation's info by channel ID. 목록에 없는(=워크스페이스가 커서
     * conversations.list 앞부분에 안 잡히는) 채널을 ID로 직접 조회·검증할 때 쓴다.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getConversationInfo(String botToken, String channelId) {
        return callSlackApiGet(botToken, SLACK_API_BASE + "/conversations.info?channel=" + channelId);
    }

    /**
     * 채널 메시지 이력을 한 페이지 읽어온다 ({@code conversations.history}).
     *
     * <p>{@code oldest}/{@code latest}는 Slack ts(유닉스 초). 구간은 [oldest, latest)로,
     * {@code inclusive=false}라 경계 메시지가 양쪽 보고서에 중복되지 않는다. 읽으려면 봇 토큰에
     * {@code channels:history}(공개)/{@code groups:history}(비공개) 스코프가 있어야 하고,
     * 봇이 그 채널에 초대돼 있어야 한다 — 없으면 Slack이 {@code missing_scope}/{@code not_in_channel}을 돌려준다.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> conversationsHistory(String botToken, String channelId,
                                                    long oldestEpochSec, long latestEpochSec,
                                                    String cursor, int limit) {
        String url = SLACK_API_BASE + "/conversations.history?channel=" + channelId
                + "&oldest=" + oldestEpochSec + "&latest=" + latestEpochSec
                + "&inclusive=false&limit=" + limit;
        if (cursor != null && !cursor.isBlank()) {
            url += "&cursor=" + cursor;
        }
        return callSlackApiGet(botToken, url);
    }

    /**
     * 스레드 답글을 읽어온다 ({@code conversations.replies}). 반환 messages의 첫 항목은 부모 글이다.
     * {@code channels:history}/{@code groups:history} 스코프로 동작한다.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> conversationsReplies(String botToken, String channelId,
                                                    String threadTs, int limit) {
        String url = SLACK_API_BASE + "/conversations.replies?channel=" + channelId
                + "&ts=" + threadTs + "&limit=" + limit;
        return callSlackApiGet(botToken, url);
    }

    /** 다운로드한 파일의 바이트와 콘텐츠 타입 */
    public record FileContent(byte[] bytes, String contentType) {}

    /**
     * 슬랙에 올라온 파일을 봇 토큰으로 내려받는다. {@code url_private}는 Bearer 인증이 필요해
     * 페이지에 바로 못 박으므로, 받아서 우리 스토리지로 옮겨야 한다. {@code files:read} 스코프가 필요하다.
     */
    public FileContent downloadFile(String botToken, String urlPrivate) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(botToken);
        HttpEntity<Void> request = new HttpEntity<>(headers);
        ResponseEntity<byte[]> response = restTemplate.exchange(urlPrivate, HttpMethod.GET, request, byte[].class);
        if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
            throw new BusinessException(ErrorCode.SLACK_API_ERROR);
        }
        MediaType type = response.getHeaders().getContentType();
        return new FileContent(response.getBody(), type != null ? type.toString() : "application/octet-stream");
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
