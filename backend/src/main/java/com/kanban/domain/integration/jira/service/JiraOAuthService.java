package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.jira.JiraConnectionStatus;
import com.kanban.domain.integration.jira.JiraIntegrationConfig;
import com.kanban.domain.integration.jira.JiraIntegrationConfigRepository;
import com.kanban.domain.integration.jira.config.JiraOAuthProperties;
import com.kanban.domain.integration.jira.dto.JiraResponse;
import com.kanban.domain.integration.slack.service.SlackTokenEncryptor;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;

/**
 * JIRA OAuth 2.0 (3LO). "Atlassian으로 연결" 버튼 → 동의 → 콜백 → 사이트 선택 흐름.
 * 토큰 자동 갱신(offline_access)까지 담당. HMAC state·토큰 암호화는 Discord/Slack 패턴 재사용.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JiraOAuthService {

    private static final String AUTH_BASE = "https://auth.atlassian.com";
    private static final String API_BASE = "https://api.atlassian.com";
    // read:board-scope(.admin) = Jira Software(Agile) 보드/컬럼 구성 읽기 — 미러 컬럼을 JIRA 보드 그대로 가져오기 위함.
    // classic(read:jira-work)만으론 /rest/agile/1.0 이 401 → granular board-scope 필요. classic+granular 혼용 허용됨.
    private static final String SCOPES = "read:jira-work write:jira-work "
        + "read:board-scope:jira-software read:board-scope.admin:jira-software offline_access";
    private static final long STATE_EXPIRY_SECONDS = 600; // 10분
    private static final long REFRESH_BUFFER_SECONDS = 60;

    private final RestTemplate restTemplate;
    private final JiraOAuthProperties oauthProps;
    private final SlackTokenEncryptor tokenEncryptor;
    private final JiraIntegrationConfigRepository configRepository;
    private final BoardService boardService;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;

    @Value("${jwt.secret:bridge-default-secret-key-change-me}")
    private String jwtSecret;

    // ── 인증 URL ──────────────────────────────────

    public JiraResponse.OAuthUrl getAuthorizeUrl(String boardId, String userId, String origin) {
        boardService.checkAdminOrAbove(boardId, userId);
        if (!oauthProps.isConfigured()) {
            throw new BusinessException(ErrorCode.JIRA_CONNECTION_FAILED, "JIRA OAuth 앱이 설정되지 않았습니다");
        }
        String state = generateState(boardId, userId, origin);
        String url = AUTH_BASE + "/authorize"
            + "?audience=api.atlassian.com"
            + "&client_id=" + enc(oauthProps.getClientId())
            + "&scope=" + enc(SCOPES)
            + "&redirect_uri=" + enc(oauthProps.getRedirectUri())
            + "&state=" + enc(state)
            + "&response_type=code"
            + "&prompt=consent";
        return JiraResponse.OAuthUrl.builder().oauth_url(url).build();
    }

    // ── 콜백 (code → tokens → config 저장) ────────

    @Transactional
    public String handleCallback(String code, String state) {
        StateData sd = verifyState(state);

        // 토큰 교환
        Map<String, Object> tokenBody = new HashMap<>();
        tokenBody.put("grant_type", "authorization_code");
        tokenBody.put("client_id", oauthProps.getClientId());
        tokenBody.put("client_secret", oauthProps.getClientSecret());
        tokenBody.put("code", code);
        tokenBody.put("redirect_uri", oauthProps.getRedirectUri());
        JsonNode tokens = postJson(AUTH_BASE + "/oauth/token", tokenBody, null);

        String accessToken = text(tokens, "access_token");
        String refreshToken = text(tokens, "refresh_token");
        long expiresIn = tokens.path("expires_in").asLong(3600);
        // 진단: 토큰이 실제로 부여받은 스코프 (board-scope 포함 여부 확인용)
        log.info("JIRA OAuth granted scopes for board {}: {}", sd.boardId, tokens.path("scope").asText("(none)"));
        if (accessToken == null) {
            throw new BusinessException(ErrorCode.JIRA_CONNECTION_FAILED);
        }
        LocalDateTime expiresAt = LocalDateTime.now(ZoneOffset.UTC).plusSeconds(expiresIn);

        JiraIntegrationConfig config = configRepository.findByBoardId(sd.boardId).orElse(null);
        if (config == null) {
            Board board = boardRepository.findById(sd.boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
            User user = userRepository.findById(sd.userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
            config = JiraIntegrationConfig.builder()
                .board(board)
                .connectedBy(user)
                .apiTokenEncrypted(tokenEncryptor.encrypt(accessToken))
                .refreshTokenEncrypted(tokenEncryptor.encrypt(refreshToken))
                .tokenExpiresAt(expiresAt)
                .status(JiraConnectionStatus.DISCONNECTED) // 사이트/프로젝트 확정 전까지 pending
                .active(false)
                .build();
            config.applyOAuthTokens(tokenEncryptor.encrypt(accessToken),
                refreshToken != null ? tokenEncryptor.encrypt(refreshToken) : null, expiresAt);
            configRepository.save(config);
        } else {
            config.applyOAuthTokens(tokenEncryptor.encrypt(accessToken),
                refreshToken != null ? tokenEncryptor.encrypt(refreshToken) : null, expiresAt);
        }
        log.info("JIRA OAuth tokens stored for board {} (pending site selection)", sd.boardId);
        return sd.origin + "?jira=oauth_success&board=" + enc(sd.boardId);
    }

    // ── 접근 가능한 사이트 목록 ───────────────────

    @Transactional
    public List<JiraResponse.SiteRef> getAccessibleSites(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        JiraIntegrationConfig config = configRepository.findByBoardId(boardId)
            .orElseThrow(() -> new BusinessException(ErrorCode.JIRA_NOT_CONFIGURED));
        if (!config.isOAuth()) {
            throw new BusinessException(ErrorCode.JIRA_NOT_CONFIGURED, "OAuth 연결이 아닙니다");
        }
        String token = resolveToken(config);
        JsonNode resources = getJson(API_BASE + "/oauth/token/accessible-resources", token);

        List<JiraResponse.SiteRef> sites = new ArrayList<>();
        if (resources != null && resources.isArray()) {
            for (JsonNode r : resources) {
                sites.add(JiraResponse.SiteRef.builder()
                    .cloud_id(r.path("id").asText(null))
                    .url(r.path("url").asText(null))
                    .name(r.path("name").asText(null))
                    .build());
            }
        }
        return sites;
    }

    // ── 사이트/프로젝트 확정 ──────────────────────

    @Transactional
    public JiraIntegrationConfig finalizeTarget(String boardId, String userId, String cloudId, String baseUrl, String projectKey) {
        boardService.checkAdminOrAbove(boardId, userId);
        JiraIntegrationConfig config = configRepository.findByBoardId(boardId)
            .orElseThrow(() -> new BusinessException(ErrorCode.JIRA_NOT_CONFIGURED));
        if (!config.isOAuth()) {
            throw new BusinessException(ErrorCode.JIRA_NOT_CONFIGURED, "OAuth 연결이 아닙니다");
        }
        // 프로젝트 접근 검증
        String token = resolveToken(config);
        try {
            new JiraApiClientProbe().verifyProject(cloudId, token, projectKey);
        } catch (BusinessException e) {
            throw new BusinessException(ErrorCode.JIRA_PROJECT_NOT_FOUND);
        }
        config.finalizeOAuthTarget(normalizeHost(baseUrl), cloudId, projectKey);
        log.info("JIRA OAuth finalized for board {} → {} / {}", boardId, cloudId, projectKey);
        return config;
    }

    // ── 토큰 해석 (API_TOKEN=복호화, OAUTH=임박 시 갱신) ──

    /** 호출자의 @Transactional 안에서 실행 — OAuth 갱신 시 config 토큰 변경이 영속화됨. */
    public String resolveToken(JiraIntegrationConfig config) {
        if (!config.isOAuth()) {
            return tokenEncryptor.decrypt(config.getApiTokenEncrypted());
        }
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        boolean expiring = config.getTokenExpiresAt() == null
            || !now.plusSeconds(REFRESH_BUFFER_SECONDS).isBefore(config.getTokenExpiresAt());
        if (!expiring) {
            return tokenEncryptor.decrypt(config.getApiTokenEncrypted());
        }
        return refreshAccessToken(config);
    }

    private String refreshAccessToken(JiraIntegrationConfig config) {
        if (config.getRefreshTokenEncrypted() == null) {
            throw new BusinessException(ErrorCode.JIRA_AUTH_FAILED, "refresh token 없음 — 재연결 필요");
        }
        String refreshToken = tokenEncryptor.decrypt(config.getRefreshTokenEncrypted());
        Map<String, Object> body = new HashMap<>();
        body.put("grant_type", "refresh_token");
        body.put("client_id", oauthProps.getClientId());
        body.put("client_secret", oauthProps.getClientSecret());
        body.put("refresh_token", refreshToken);

        JsonNode tokens;
        try {
            tokens = postJson(AUTH_BASE + "/oauth/token", body, null);
        } catch (Exception e) {
            config.markError("토큰 갱신 실패 — 재연결 필요");
            throw new BusinessException(ErrorCode.JIRA_AUTH_FAILED);
        }
        String newAccess = text(tokens, "access_token");
        String newRefresh = text(tokens, "refresh_token"); // rotating
        long expiresIn = tokens.path("expires_in").asLong(3600);
        LocalDateTime expiresAt = LocalDateTime.now(ZoneOffset.UTC).plusSeconds(expiresIn);

        config.applyOAuthTokens(tokenEncryptor.encrypt(newAccess),
            newRefresh != null ? tokenEncryptor.encrypt(newRefresh) : null, expiresAt);
        return newAccess;
    }

    // ── HTTP 헬퍼 ─────────────────────────────────

    private JsonNode postJson(String url, Map<String, Object> body, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (bearer != null) headers.setBearerAuth(bearer);
        ResponseEntity<JsonNode> res = restTemplate.exchange(url, HttpMethod.POST, new HttpEntity<>(body, headers), JsonNode.class);
        if (!res.getStatusCode().is2xxSuccessful() || res.getBody() == null) {
            throw new BusinessException(ErrorCode.JIRA_CONNECTION_FAILED);
        }
        return res.getBody();
    }

    private JsonNode getJson(String url, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(bearer);
        ResponseEntity<JsonNode> res = restTemplate.exchange(url, HttpMethod.GET, new HttpEntity<>(headers), JsonNode.class);
        if (!res.getStatusCode().is2xxSuccessful()) {
            throw new BusinessException(ErrorCode.JIRA_API_ERROR);
        }
        return res.getBody();
    }

    /** 프로젝트 검증용 경량 프로브 (JiraApiClient 순환 의존 회피). */
    private class JiraApiClientProbe {
        void verifyProject(String cloudId, String token, String projectKey) {
            getJson(API_BASE + "/ex/jira/" + cloudId + "/rest/api/3/project/" + projectKey, token);
        }
    }

    // ── HMAC state ────────────────────────────────

    private String generateState(String boardId, String userId, String origin) {
        long ts = System.currentTimeMillis() / 1000;
        String payload = boardId + "|" + userId + "|" + origin + "|" + ts;
        String b64 = Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        return b64 + "." + computeHmac(b64);
    }

    private StateData verifyState(String state) {
        if (state == null || !state.contains(".")) {
            throw new BusinessException(ErrorCode.JIRA_CONNECTION_FAILED, "유효하지 않은 state");
        }
        int dot = state.lastIndexOf('.');
        String b64 = state.substring(0, dot);
        String sig = state.substring(dot + 1);
        if (!computeHmac(b64).equals(sig)) {
            throw new BusinessException(ErrorCode.JIRA_CONNECTION_FAILED, "state 서명 불일치");
        }
        String payload = new String(Base64.getUrlDecoder().decode(b64), StandardCharsets.UTF_8);
        String[] parts = payload.split("\\|", 4);
        if (parts.length != 4) {
            throw new BusinessException(ErrorCode.JIRA_CONNECTION_FAILED, "state 형식 오류");
        }
        long ts = Long.parseLong(parts[3]);
        if (System.currentTimeMillis() / 1000 - ts > STATE_EXPIRY_SECONDS) {
            throw new BusinessException(ErrorCode.JIRA_CONNECTION_FAILED, "state 만료");
        }
        return new StateData(parts[0], parts[1], parts[2]);
    }

    private String computeHmac(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] sig = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(sig);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.JIRA_CONNECTION_FAILED);
        }
    }

    private String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v != null && !v.isNull() ? v.asText() : null;
    }

    private String normalizeHost(String baseUrl) {
        if (baseUrl == null) return null;
        return baseUrl.trim().replaceFirst("^https?://", "").replaceAll("/+$", "");
    }

    private record StateData(String boardId, String userId, String origin) {}
}
