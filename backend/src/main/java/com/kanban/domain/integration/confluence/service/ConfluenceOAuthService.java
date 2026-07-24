package com.kanban.domain.integration.confluence.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.IntegrationScope;
import com.kanban.domain.integration.confluence.ConfluenceAuthType;
import com.kanban.domain.integration.confluence.ConfluenceIntegrationConfig;
import com.kanban.domain.integration.confluence.ConfluenceIntegrationConfigRepository;
import com.kanban.domain.integration.confluence.config.ConfluenceOAuthProperties;
import com.kanban.domain.integration.confluence.dto.ConfluenceResponse;
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
 * Confluence Cloud OAuth 3LO. 흐름은 {@code JiraOAuthService}와 같은 모양이지만
 * <b>완전히 독립적인 연결</b>이다 — 자기 토큰과 자기 cloudId를 갖는다.
 *
 * <p>JIRA의 cloudId를 빌려 쓰지 않는 이유: 그 값은 JIRA 사이트로 확정된 것이고,
 * Confluence가 다른 도메인에 있으면 그대로 호출하는 순간 404가 난다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ConfluenceOAuthService {

    private static final String AUTH_BASE = "https://auth.atlassian.com";
    private static final String API_BASE = "https://api.atlassian.com";

    /**
     * 순수 granular 스코프.
     *
     * <p>Confluence는 v2 API(spaces/pages)를 써야 하는데, v2는 classic 스코프를 거부한다
     * ("Unauthorized; scope does not match" 401). 반대로 v1 CQL 검색은 granular를 받아준다.
     * → granular 하나로 v2·v1을 모두 커버할 수 있다.
     *
     * <p><b>classic과 절대 혼용하지 않는다.</b> 혼용하면 Atlassian이 토큰을 classic 모드로
     * 평가해 granular를 무시 → v2가 401. JIRA에서 실측으로 확인된 함정이다(9083af14).
     *
     * <pre>
     *   read:space:confluence            → GET /wiki/api/v2/spaces
     *   read:page:confluence             → GET /wiki/api/v2/pages/{id}?body-format=storage
     *   read:content-details:confluence  → GET /wiki/rest/api/search?cql=...  (v1, 존치)
     * </pre>
     */
    private static final String SCOPES =
            "read:space:confluence read:page:confluence "
            + "read:content-details:confluence offline_access";

    private static final long STATE_EXPIRY_SECONDS = 600;
    private static final long REFRESH_BUFFER_SECONDS = 60;

    private final RestTemplate restTemplate;
    private final ConfluenceOAuthProperties oauthProps;
    private final SlackTokenEncryptor tokenEncryptor;
    private final ConfluenceIntegrationConfigRepository configRepository;
    private final BoardService boardService;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;

    @Value("${jwt.secret:bridge-default-secret-key-change-me}")
    private String jwtSecret;

    private record StateData(String boardId, String userId, String origin) {
    }

    // ── 인증 URL ────────────────────────────────

    public ConfluenceResponse.OAuthUrl getAuthorizeUrl(String boardId, String userId, String origin) {
        boardService.checkAdminOrAbove(boardId, userId);
        if (!oauthProps.isConfigured()) {
            throw new BusinessException(ErrorCode.CONFLUENCE_NOT_CONFIGURED,
                    "Confluence OAuth 앱이 설정되지 않았습니다");
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
        return ConfluenceResponse.OAuthUrl.builder().oauthUrl(url).build();
    }

    // ── 콜백 ────────────────────────────────────

    @Transactional
    public String handleCallback(String code, String state) {
        StateData sd = verifyState(state);

        Map<String, Object> body = new HashMap<>();
        body.put("grant_type", "authorization_code");
        body.put("client_id", oauthProps.getClientId());
        body.put("client_secret", oauthProps.getClientSecret());
        body.put("code", code);
        body.put("redirect_uri", oauthProps.getRedirectUri());

        JsonNode tokens = postJson(AUTH_BASE + "/oauth/token", body);
        String accessToken = text(tokens, "access_token");
        String refreshToken = text(tokens, "refresh_token");
        if (accessToken == null) {
            throw new BusinessException(ErrorCode.CONFLUENCE_CONNECTION_FAILED);
        }
        log.info("Confluence OAuth granted scopes for board {}: {}",
                sd.boardId(), tokens.path("scope").asText("(none)"));

        LocalDateTime expiresAt = LocalDateTime.now(ZoneOffset.UTC)
                .plusSeconds(tokens.path("expires_in").asLong(3600));

        ConfluenceIntegrationConfig config = configRepository.findByBoardId(sd.boardId())
                .orElseGet(() -> {
                    Board board = boardRepository.findById(sd.boardId())
                            .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
                    User user = userRepository.findById(sd.userId())
                            .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
                    return configRepository.save(ConfluenceIntegrationConfig.builder()
                            .board(board)
                            .scope(IntegrationScope.BOARD)
                            .authType(ConfluenceAuthType.OAUTH_3LO)
                            .connectedBy(user)
                            .build());
                });

        config.applyOAuthTokens(tokenEncryptor.encrypt(accessToken),
                refreshToken != null ? tokenEncryptor.encrypt(refreshToken) : null, expiresAt);

        return sd.origin() + "?confluence=oauth_success&board=" + enc(sd.boardId());
    }

    // ── 접근 가능한 사이트 ───────────────────────

    /**
     * 이 토큰으로 열 수 있는 Atlassian 사이트 전부. JIRA 사이트와 Confluence 사이트가
     * 다를 수 있으므로 <b>사용자가 직접 고르게</b> 한다.
     */
    @Transactional
    public List<ConfluenceResponse.SiteRef> getAccessibleSites(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        ConfluenceIntegrationConfig config = requireConfig(boardId);
        String token = resolveToken(config);

        JsonNode resources = getJson(API_BASE + "/oauth/token/accessible-resources", token);
        List<ConfluenceResponse.SiteRef> sites = new ArrayList<>();
        if (resources != null && resources.isArray()) {
            for (JsonNode r : resources) {
                List<String> scopes = new ArrayList<>();
                r.path("scopes").forEach(s -> scopes.add(s.asText()));
                // Confluence 스코프가 없는 사이트는 골라봐야 404가 난다 — 미리 표시해 준다.
                boolean hasConfluence = scopes.stream().anyMatch(s -> s.contains("confluence"));
                sites.add(ConfluenceResponse.SiteRef.builder()
                        .cloudId(r.path("id").asText(null))
                        .url(r.path("url").asText(null))
                        .name(r.path("name").asText(null))
                        .confluenceAvailable(hasConfluence)
                        .build());
            }
        }
        return sites;
    }

    /**
     * 사이트 확정. scope claim만 봐서는 실제 접근 가능 여부를 알 수 없으므로
     * <b>스페이스를 한 번 실제로 조회해</b> 200을 확인한 뒤에만 저장한다.
     */
    @Transactional
    public ConfluenceIntegrationConfig finalizeSite(String boardId, String userId,
                                                    String cloudId, String baseUrl, String siteName) {
        boardService.checkAdminOrAbove(boardId, userId);
        ConfluenceIntegrationConfig config = requireConfig(boardId);
        String token = resolveToken(config);

        try {
            // v1 /wiki/rest/api/space 는 제거되어 410 Gone → v2 spaces 로 검증한다.
            getJson(API_BASE + "/ex/confluence/" + cloudId + "/wiki/api/v2/spaces?limit=1", token);
        } catch (Exception e) {
            log.warn("Confluence 사이트 검증 실패 board={} cloudId={}: {}", boardId, cloudId, e.getMessage());
            throw new BusinessException(ErrorCode.CONFLUENCE_CONNECTION_FAILED,
                    "이 사이트의 Confluence에 접근할 수 없습니다. 권한을 확인하거나 다시 인증해주세요");
        }
        config.applySite(cloudId, normalizeHost(baseUrl), siteName);
        log.info("Confluence 사이트 확정 board={} → {}", boardId, cloudId);
        return config;
    }

    // ── 토큰 ────────────────────────────────────

    /** 호출자의 트랜잭션 안에서 실행 — 갱신된 토큰이 그대로 영속화된다. */
    public String resolveToken(ConfluenceIntegrationConfig config) {
        if (!config.isOAuth()) {
            return tokenEncryptor.decrypt(config.getAccessTokenEncrypted());
        }
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        boolean expiring = config.getTokenExpiresAt() == null
                || !now.plusSeconds(REFRESH_BUFFER_SECONDS).isBefore(config.getTokenExpiresAt());
        if (!expiring) {
            return tokenEncryptor.decrypt(config.getAccessTokenEncrypted());
        }
        return refreshAccessToken(config);
    }

    private String refreshAccessToken(ConfluenceIntegrationConfig config) {
        if (config.getRefreshTokenEncrypted() == null) {
            throw new BusinessException(ErrorCode.CONFLUENCE_AUTH_FAILED, "refresh token 없음 — 재연결 필요");
        }
        Map<String, Object> body = new HashMap<>();
        body.put("grant_type", "refresh_token");
        body.put("client_id", oauthProps.getClientId());
        body.put("client_secret", oauthProps.getClientSecret());
        body.put("refresh_token", tokenEncryptor.decrypt(config.getRefreshTokenEncrypted()));

        JsonNode tokens;
        try {
            tokens = postJson(AUTH_BASE + "/oauth/token", body);
        } catch (Exception e) {
            config.markFailure("토큰 갱신 실패 — 재연결 필요");
            throw new BusinessException(ErrorCode.CONFLUENCE_AUTH_FAILED);
        }
        String newAccess = text(tokens, "access_token");
        String newRefresh = text(tokens, "refresh_token");   // 회전형
        LocalDateTime expiresAt = LocalDateTime.now(ZoneOffset.UTC)
                .plusSeconds(tokens.path("expires_in").asLong(3600));

        config.applyOAuthTokens(tokenEncryptor.encrypt(newAccess),
                newRefresh != null ? tokenEncryptor.encrypt(newRefresh) : null, expiresAt);
        return newAccess;
    }

    private ConfluenceIntegrationConfig requireConfig(String boardId) {
        return configRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CONFLUENCE_NOT_CONNECTED));
    }

    // ── HTTP ────────────────────────────────────

    private JsonNode postJson(String url, Map<String, Object> body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<JsonNode> response = restTemplate.exchange(
                url, HttpMethod.POST, new HttpEntity<>(body, headers), JsonNode.class);
        return response.getBody();
    }

    private JsonNode getJson(String url, String bearer) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(bearer);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        ResponseEntity<JsonNode> response = restTemplate.exchange(
                url, HttpMethod.GET, new HttpEntity<>(headers), JsonNode.class);
        return response.getBody();
    }

    // ── state (HMAC 서명) ───────────────────────

    private String generateState(String boardId, String userId, String origin) {
        long ts = System.currentTimeMillis() / 1000;
        String payload = boardId + "|" + userId + "|" + origin + "|" + ts;
        String b64 = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        return b64 + "." + computeHmac(b64);
    }

    private StateData verifyState(String state) {
        if (state == null || !state.contains(".")) {
            throw new BusinessException(ErrorCode.CONFLUENCE_CONNECTION_FAILED, "유효하지 않은 state");
        }
        int dot = state.lastIndexOf('.');
        String b64 = state.substring(0, dot);
        if (!computeHmac(b64).equals(state.substring(dot + 1))) {
            throw new BusinessException(ErrorCode.CONFLUENCE_CONNECTION_FAILED, "state 서명 불일치");
        }
        String payload = new String(Base64.getUrlDecoder().decode(b64), StandardCharsets.UTF_8);
        String[] parts = payload.split("\\|", 4);
        if (parts.length != 4) {
            throw new BusinessException(ErrorCode.CONFLUENCE_CONNECTION_FAILED, "state 형식 오류");
        }
        long ts = Long.parseLong(parts[3]);
        if (System.currentTimeMillis() / 1000 - ts > STATE_EXPIRY_SECONDS) {
            throw new BusinessException(ErrorCode.CONFLUENCE_CONNECTION_FAILED, "state 만료 — 다시 시도해주세요");
        }
        return new StateData(parts[0], parts[1], parts[2]);
    }

    private String computeHmac(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.CONFLUENCE_CONNECTION_FAILED, "state 서명 실패");
        }
    }

    private String text(JsonNode node, String field) {
        return node != null && node.hasNonNull(field) ? node.get(field).asText() : null;
    }

    private String normalizeHost(String baseUrl) {
        if (baseUrl == null) {
            return null;
        }
        String trimmed = baseUrl.trim();
        return trimmed.endsWith("/") ? trimmed.substring(0, trimmed.length() - 1) : trimmed;
    }

    private String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
