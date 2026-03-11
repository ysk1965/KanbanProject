package com.kanban.domain.integration.slack.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.integration.FrontendOriginResolver;
import com.kanban.domain.integration.slack.*;
import com.kanban.domain.integration.slack.config.SlackAppConfig;
import com.kanban.domain.integration.slack.dto.SlackAppResponse;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.repository.OrganizationRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SlackOAuthService {

    private static final long STATE_TTL_SECONDS = 600; // 10 minutes

    private final SlackAppConfig config;
    private final SlackInstallationRepository installationRepository;
    private final SlackApiClient slackApiClient;
    private final SlackTokenEncryptor tokenEncryptor;
    private final SlackUserLinkRepository userLinkRepository;
    private final BoardRepository boardRepository;
    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;

    /**
     * Generate Slack OAuth install URL with signed state
     */
    public SlackAppResponse.InstallUrl generateInstallUrl(SlackInstallScope scope, String entityId, String userId, String origin) {
        String state = buildState(scope, entityId, userId, origin);
        String redirectUri = resolveRedirectUri(origin, config.getRedirectUri());
        String url = "https://slack.com/oauth/v2/authorize"
                + "?client_id=" + URLEncoder.encode(config.getClientId(), StandardCharsets.UTF_8)
                + "&scope=" + URLEncoder.encode(config.getBotScopes(), StandardCharsets.UTF_8)
                + "&redirect_uri=" + URLEncoder.encode(redirectUri, StandardCharsets.UTF_8)
                + "&state=" + URLEncoder.encode(state, StandardCharsets.UTF_8);

        return SlackAppResponse.InstallUrl.builder().url(url).build();
    }

    /**
     * Handle OAuth callback - exchange code for token and create installation
     */
    @Transactional
    public SlackAppResponse.OAuthCallback handleCallback(String code, String stateParam) {
        // Validate state
        Map<String, String> stateData = parseAndVerifyState(stateParam);
        String scopeStr = stateData.get("scope");
        String entityId = stateData.get("entityId");
        String userId = stateData.get("userId");

        String origin = stateData.get("origin");

        SlackInstallScope scope = SlackInstallScope.valueOf(scopeStr);

        // Exchange code for token
        String redirectUri = resolveRedirectUri(origin, config.getRedirectUri());
        log.info("Slack OAuth token exchange: origin={}, redirectUri={}, configuredUri={}", origin, redirectUri, config.getRedirectUri());
        Map<String, Object> oauthResponse = slackApiClient.exchangeCode(
                config.getClientId(), config.getClientSecret(), code, redirectUri);

        // Extract token and team info
        @SuppressWarnings("unchecked")
        Map<String, Object> team = (Map<String, Object>) oauthResponse.get("team");
        if (team == null) {
            throw new BusinessException(ErrorCode.SLACK_OAUTH_FAILED);
        }
        String slackTeamId = String.valueOf(team.get("id"));
        String slackTeamName = String.valueOf(team.get("name"));

        String botToken = String.valueOf(oauthResponse.get("access_token"));
        String botUserId = oauthResponse.containsKey("bot_user_id")
                ? String.valueOf(oauthResponse.get("bot_user_id"))
                : null;

        String authedUserId = null;
        @SuppressWarnings("unchecked")
        Map<String, Object> authedUser = (Map<String, Object>) oauthResponse.get("authed_user");
        if (authedUser != null) {
            authedUserId = String.valueOf(authedUser.get("id"));
        }

        String grantedScopes = String.valueOf(oauthResponse.get("scope"));

        // Encrypt bot token
        String encryptedToken = tokenEncryptor.encrypt(botToken);

        // Find user and entity
        log.info("Slack OAuth callback: looking up userId={}, scope={}, entityId={}, origin={}", userId, scopeStr, entityId, origin);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> {
                    log.error("Slack OAuth callback: USER_NOT_FOUND for userId={}", userId);
                    return new BusinessException(ErrorCode.USER_NOT_FOUND);
                });

        Board board = null;
        Organization organization = null;
        String redirectPath;

        if (scope == SlackInstallScope.BOARD) {
            board = boardRepository.findById(entityId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
            redirectPath = "/boards/" + entityId + "?slack=connected";

            // Deactivate existing installation for this team+board
            installationRepository.findActiveByTeamIdAndBoardId(slackTeamId, entityId)
                    .ifPresent(existing -> existing.deactivate());
        } else {
            organization = organizationRepository.findById(entityId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.ORG_NOT_FOUND));
            redirectPath = "/organization/" + entityId + "/settings?slack=connected";

            // Deactivate existing installation for this team+org
            installationRepository.findActiveByTeamIdAndOrgId(slackTeamId, entityId)
                    .ifPresent(existing -> existing.deactivate());
        }

        // Create new installation
        SlackInstallation installation = SlackInstallation.builder()
                .board(board)
                .organization(organization)
                .scope(scope)
                .slackTeamId(slackTeamId)
                .slackTeamName(slackTeamName)
                .botTokenEncrypted(encryptedToken)
                .botUserId(botUserId)
                .installedBy(user)
                .slackInstallerUserId(authedUserId)
                .scopes(grantedScopes)
                .active(true)
                .build();

        installationRepository.save(installation);

        log.info("Slack App installed for {} {} by user {} (team: {})",
                scope, entityId, userId, slackTeamName);

        return SlackAppResponse.OAuthCallback.builder()
                .installation(SlackAppResponse.Installation.from(installation))
                .redirectPath(redirectPath)
                .origin(origin)
                .build();
    }

    /**
     * Find active installation for a board (board-first, org-fallback)
     */
    @Transactional(readOnly = true)
    public Optional<SlackInstallation> findActiveInstallation(Board board) {
        Optional<SlackInstallation> boardInstall = installationRepository.findActiveByBoardId(board.getId());
        if (boardInstall.isPresent()) {
            return boardInstall;
        }
        // Fallback to org-level
        if (board.getOrganization() != null) {
            return installationRepository.findActiveByOrganizationId(board.getOrganization().getId());
        }
        return Optional.empty();
    }

    /**
     * Get installation status
     */
    @Transactional(readOnly = true)
    public SlackAppResponse.Installation getInstallationStatus(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        return findActiveInstallation(board)
                .map(SlackAppResponse.Installation::from)
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public SlackAppResponse.Installation getOrgInstallationStatus(String orgId) {
        return installationRepository.findActiveByOrganizationId(orgId)
                .map(SlackAppResponse.Installation::from)
                .orElse(null);
    }

    /**
     * Revoke and delete installation
     */
    @Transactional
    public void revokeInstallation(String installationId, String userId) {
        SlackInstallation installation = installationRepository.findById(installationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SLACK_APP_NOT_INSTALLED));

        // Revoke token on Slack side
        try {
            String botToken = tokenEncryptor.decrypt(installation.getBotTokenEncrypted());
            slackApiClient.authRevoke(botToken);
        } catch (Exception e) {
            log.warn("Failed to revoke Slack token for installation {}: {}", installationId, e.getMessage());
        }

        installation.deactivate();
        log.info("Slack App uninstalled: {} by user {}", installationId, userId);
    }

    /**
     * List channels from Slack API
     */
    @Transactional(readOnly = true)
    public SlackAppResponse.ChannelList listChannels(SlackInstallation installation, String cursor) {
        String botToken = tokenEncryptor.decrypt(installation.getBotTokenEncrypted());
        Map<String, Object> response = slackApiClient.listConversations(botToken, "public_channel,private_channel", cursor, 100);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> channels = (List<Map<String, Object>>) response.get("channels");
        List<SlackAppResponse.Channel> channelList = new ArrayList<>();

        if (channels != null) {
            for (Map<String, Object> ch : channels) {
                channelList.add(SlackAppResponse.Channel.builder()
                        .id(String.valueOf(ch.get("id")))
                        .name(String.valueOf(ch.get("name")))
                        .isPrivate(Boolean.TRUE.equals(ch.get("is_private")))
                        .isArchived(Boolean.TRUE.equals(ch.get("is_archived")))
                        .memberCount(ch.get("num_members") != null ? ((Number) ch.get("num_members")).intValue() : 0)
                        .build());
            }
        }

        String nextCursor = null;
        @SuppressWarnings("unchecked")
        Map<String, Object> responseMetadata = (Map<String, Object>) response.get("response_metadata");
        if (responseMetadata != null && responseMetadata.get("next_cursor") != null) {
            String cur = String.valueOf(responseMetadata.get("next_cursor"));
            if (!cur.isBlank()) {
                nextCursor = cur;
            }
        }

        return SlackAppResponse.ChannelList.builder()
                .channels(channelList)
                .nextCursor(nextCursor)
                .build();
    }

    /**
     * Update default channel for an installation
     */
    @Transactional
    public void updateDefaultChannel(String installationId, String channelId, String channelName) {
        SlackInstallation installation = installationRepository.findById(installationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SLACK_APP_NOT_INSTALLED));
        installation.updateDefaultChannel(channelId, channelName);
    }

    /**
     * Decrypt bot token for use
     */
    public String decryptBotToken(SlackInstallation installation) {
        return tokenEncryptor.decrypt(installation.getBotTokenEncrypted());
    }

    // ---- User Link (per-user Slack account linking for DM notifications) ----

    /**
     * Generate Slack OAuth URL for individual user linking (identity.basic scope)
     */
    public SlackAppResponse.InstallUrl generateUserLinkUrl(String boardId, String userId, String origin) {
        String state = buildUserLinkState(boardId, userId, origin);
        String userRedirectUri = resolveRedirectUri(origin, config.getUserRedirectUri());
        String url = "https://slack.com/oauth/v2/authorize"
                + "?client_id=" + URLEncoder.encode(config.getClientId(), StandardCharsets.UTF_8)
                + "&user_scope=" + URLEncoder.encode(config.getUserScopes(), StandardCharsets.UTF_8)
                + "&redirect_uri=" + URLEncoder.encode(userRedirectUri, StandardCharsets.UTF_8)
                + "&state=" + URLEncoder.encode(state, StandardCharsets.UTF_8);

        return SlackAppResponse.InstallUrl.builder().url(url).build();
    }

    /**
     * Handle user link OAuth callback - link Slack identity to BRIDGE user
     */
    @Transactional
    public SlackAppResponse.UserLinkCallback handleUserLinkCallback(String code, String stateParam) {
        Map<String, String> stateData = parseAndVerifyUserLinkState(stateParam);
        String boardId = stateData.get("boardId");
        String userId = stateData.get("userId");
        String origin = stateData.get("origin");

        // Exchange code for user token
        String userRedirectUri = resolveRedirectUri(origin, config.getUserRedirectUri());
        Map<String, Object> tokenResponse = slackApiClient.exchangeCodeForUserToken(
                config.getClientId(), config.getClientSecret(), code, userRedirectUri);

        // Extract user info from authed_user
        @SuppressWarnings("unchecked")
        Map<String, Object> authedUser = (Map<String, Object>) tokenResponse.get("authed_user");
        if (authedUser == null) {
            throw new BusinessException(ErrorCode.SLACK_OAUTH_FAILED);
        }

        String slackUserId = String.valueOf(authedUser.get("id"));
        String accessToken = authedUser.get("access_token") != null ? String.valueOf(authedUser.get("access_token")) : null;

        // Get team info
        @SuppressWarnings("unchecked")
        Map<String, Object> team = (Map<String, Object>) tokenResponse.get("team");
        String slackTeamId = team != null ? String.valueOf(team.get("id")) : null;

        // Try to get username via users.identity if we have a user token
        String slackUsername = null;
        if (accessToken != null) {
            try {
                Map<String, Object> identity = slackApiClient.usersIdentity(accessToken);
                @SuppressWarnings("unchecked")
                Map<String, Object> userInfo = (Map<String, Object>) identity.get("user");
                if (userInfo != null) {
                    slackUsername = String.valueOf(userInfo.get("name"));
                }
            } catch (Exception e) {
                log.warn("Failed to get Slack user identity: {}", e.getMessage());
            }
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        Optional<SlackUserLink> existingLink = userLinkRepository.findByUserId(userId);

        if (existingLink.isPresent()) {
            // Update existing link
            SlackUserLink link = existingLink.get();
            link.updateUsername(slackUsername);
            userLinkRepository.save(link);
        } else {
            // Check if Slack account already linked to another user
            if (userLinkRepository.findBySlackUserId(slackUserId).isPresent()) {
                throw new BusinessException(ErrorCode.SLACK_OAUTH_FAILED);
            }

            SlackUserLink link = SlackUserLink.builder()
                    .user(user)
                    .slackUserId(slackUserId)
                    .slackUsername(slackUsername)
                    .slackTeamId(slackTeamId)
                    .accessToken(accessToken != null ? tokenEncryptor.encrypt(accessToken) : null)
                    .build();
            userLinkRepository.save(link);
        }

        log.info("Slack user linked: userId={} slackUserId={}", userId, slackUserId);

        return SlackAppResponse.UserLinkCallback.builder()
                .redirectPath("/boards/" + boardId + "?view=settings&tab=slack&status=user_linked")
                .origin(origin)
                .build();
    }

    /**
     * Get user's Slack link status
     */
    @Transactional(readOnly = true)
    public SlackAppResponse.UserLinkStatus getUserLinkStatus(String userId) {
        Optional<SlackUserLink> link = userLinkRepository.findByUserId(userId);
        if (link.isPresent()) {
            SlackUserLink l = link.get();
            return SlackAppResponse.UserLinkStatus.builder()
                    .linked(true)
                    .slackUserId(l.getSlackUserId())
                    .slackUsername(l.getSlackUsername())
                    .slackTeamId(l.getSlackTeamId())
                    .build();
        }
        return SlackAppResponse.UserLinkStatus.builder().linked(false).build();
    }

    /**
     * Unlink user's Slack account
     */
    @Transactional
    public void unlinkUser(String userId) {
        userLinkRepository.deleteByUserId(userId);
        log.info("Slack user unlinked: userId={}", userId);
    }

    /**
     * Get all members' Slack link statuses for a board
     */
    @Transactional(readOnly = true)
    public List<SlackAppResponse.MemberSlackStatus> getMemberStatuses(String boardId, List<String> memberUserIds) {
        List<SlackUserLink> links = userLinkRepository.findByUserIdIn(memberUserIds);
        Set<String> linkedUserIds = links.stream()
                .map(l -> l.getUser().getId())
                .collect(Collectors.toSet());

        Map<String, String> usernameMap = links.stream()
                .collect(Collectors.toMap(l -> l.getUser().getId(), l -> l.getSlackUsername() != null ? l.getSlackUsername() : ""));

        return memberUserIds.stream()
                .map(uid -> SlackAppResponse.MemberSlackStatus.builder()
                        .userId(uid)
                        .linked(linkedUserIds.contains(uid))
                        .slackUsername(usernameMap.getOrDefault(uid, null))
                        .build())
                .toList();
    }

    // ---- State management ----

    private String buildState(SlackInstallScope scope, String entityId, String userId, String origin) {
        long expiry = Instant.now().getEpochSecond() + STATE_TTL_SECONDS;
        String payload = scope.name() + "|" + entityId + "|" + userId + "|" + origin + "|" + expiry;
        String signature = hmacSign(payload);
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString((payload + "|" + signature).getBytes(StandardCharsets.UTF_8));
    }

    private Map<String, String> parseAndVerifyState(String state) {
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(state), StandardCharsets.UTF_8);
            String[] parts = decoded.split("\\|");
            if (parts.length != 6) {
                throw new BusinessException(ErrorCode.SLACK_OAUTH_STATE_INVALID);
            }

            String payload = parts[0] + "|" + parts[1] + "|" + parts[2] + "|" + parts[3] + "|" + parts[4];
            String signature = parts[5];

            // Verify signature
            if (!hmacSign(payload).equals(signature)) {
                throw new BusinessException(ErrorCode.SLACK_OAUTH_STATE_INVALID);
            }

            // Check expiry
            long expiry = Long.parseLong(parts[4]);
            if (Instant.now().getEpochSecond() > expiry) {
                throw new BusinessException(ErrorCode.SLACK_OAUTH_STATE_INVALID);
            }

            Map<String, String> result = new HashMap<>();
            result.put("scope", parts[0]);
            result.put("entityId", parts[1]);
            result.put("userId", parts[2]);
            result.put("origin", parts[3]);
            return result;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.SLACK_OAUTH_STATE_INVALID);
        }
    }

    private String buildUserLinkState(String boardId, String userId, String origin) {
        long expiry = Instant.now().getEpochSecond() + STATE_TTL_SECONDS;
        String payload = "USER_LINK|" + boardId + "|" + userId + "|" + origin + "|" + expiry;
        String signature = hmacSign(payload);
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString((payload + "|" + signature).getBytes(StandardCharsets.UTF_8));
    }

    private Map<String, String> parseAndVerifyUserLinkState(String state) {
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(state), StandardCharsets.UTF_8);
            String[] parts = decoded.split("\\|");
            if (parts.length != 6 || !"USER_LINK".equals(parts[0])) {
                throw new BusinessException(ErrorCode.SLACK_OAUTH_STATE_INVALID);
            }

            String payload = parts[0] + "|" + parts[1] + "|" + parts[2] + "|" + parts[3] + "|" + parts[4];
            String signature = parts[5];

            if (!hmacSign(payload).equals(signature)) {
                throw new BusinessException(ErrorCode.SLACK_OAUTH_STATE_INVALID);
            }

            long expiry = Long.parseLong(parts[4]);
            if (Instant.now().getEpochSecond() > expiry) {
                throw new BusinessException(ErrorCode.SLACK_OAUTH_STATE_INVALID);
            }

            Map<String, String> result = new HashMap<>();
            result.put("boardId", parts[1]);
            result.put("userId", parts[2]);
            result.put("origin", parts[3]);
            return result;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.SLACK_OAUTH_STATE_INVALID);
        }
    }

    private static final String SLACK_OAUTH_CALLBACK_PATH = "/api/v1/slack/oauth/callback";
    private static final String SLACK_USER_OAUTH_CALLBACK_PATH = "/api/v1/slack/oauth/user-callback";

    /**
     * Resolve redirect URI dynamically based on frontend origin.
     * Determines callback path from the configured URI, then constructs {apiBase}{path}.
     */
    private String resolveRedirectUri(String origin, String configuredRedirectUri) {
        String callbackPath = configuredRedirectUri != null && configuredRedirectUri.contains("user-callback")
                ? SLACK_USER_OAUTH_CALLBACK_PATH
                : SLACK_OAUTH_CALLBACK_PATH;
        return FrontendOriginResolver.resolveOAuthRedirectUri(origin, callbackPath, configuredRedirectUri);
    }

    /**
     * Safely extract origin from state without full verification.
     * Used for error redirects when OAuth fails but we still need the correct frontend domain.
     */
    public String safeExtractOriginFromState(String state) {
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(state), StandardCharsets.UTF_8);
            String[] parts = decoded.split("\\|");
            if (parts.length >= 4) {
                return parts[3];
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private String hmacSign(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(config.getSigningSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException("Failed to sign state", e);
        }
    }
}
