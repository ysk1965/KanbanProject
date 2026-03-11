package com.kanban.domain.integration.discord.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.discord.DiscordBotConfig;
import com.kanban.domain.integration.discord.DiscordBotConfigRepository;
import com.kanban.domain.integration.discord.DiscordUserLink;
import com.kanban.domain.integration.discord.DiscordUserLinkRepository;
import com.kanban.domain.integration.discord.dto.DiscordResponse;
import com.kanban.domain.integration.slack.service.SlackTokenEncryptor;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.kanban.domain.integration.FrontendOriginResolver;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DiscordService {

    private final DiscordBotService discordBotService;
    private final DiscordBotConfigRepository botConfigRepository;
    private final DiscordUserLinkRepository userLinkRepository;
    private final BoardService boardService;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final UserRepository userRepository;
    private final SlackTokenEncryptor tokenEncryptor;

    @Value("${discord.client-id:}")
    private String clientId;

    @Value("${discord.redirect-uri:}")
    private String redirectUri;

    @Value("${discord.bot-permissions:2048}")
    private String botPermissions;

    @Value("${jwt.secret:your-super-secret-jwt-key-that-should-be-at-least-256-bits-long}")
    private String jwtSecret;

    @Value("${app.frontend-url:https://bridgespots.com}")
    private String frontendUrl;

    // State is valid for 10 minutes
    private static final long STATE_EXPIRY_SECONDS = 600;

    /**
     * Generate OAuth2 URL for bot installation or user linking.
     */
    public DiscordResponse.OAuthUrl getOAuthUrl(String boardId, String userId, String type, String origin) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateDiscordAccess(boardId);

        String state = generateState(type, boardId, userId, origin);
        String dynamicRedirectUri = resolveRedirectUri(origin);

        String url;
        if ("bot_install".equals(type)) {
            // Bot OAuth2 URL with guild install scope
            url = "https://discord.com/oauth2/authorize"
                    + "?client_id=" + clientId
                    + "&permissions=" + botPermissions
                    + "&scope=" + URLEncoder.encode("bot", StandardCharsets.UTF_8)
                    + "&response_type=code"
                    + "&redirect_uri=" + URLEncoder.encode(dynamicRedirectUri, StandardCharsets.UTF_8)
                    + "&state=" + URLEncoder.encode(state, StandardCharsets.UTF_8);
        } else {
            // User link OAuth2 URL with identify scope
            url = "https://discord.com/oauth2/authorize"
                    + "?client_id=" + clientId
                    + "&scope=" + URLEncoder.encode("identify", StandardCharsets.UTF_8)
                    + "&response_type=code"
                    + "&redirect_uri=" + URLEncoder.encode(dynamicRedirectUri, StandardCharsets.UTF_8)
                    + "&state=" + URLEncoder.encode(state, StandardCharsets.UTF_8);
        }

        return DiscordResponse.OAuthUrl.builder()
                .oauthUrl(url)
                .build();
    }

    /**
     * Handle OAuth2 callback from Discord.
     */
    @Transactional
    public String handleOAuthCallback(String code, String state) {
        // Parse and validate state (delimiter: | to avoid conflicts with URL colons)
        String[] parts = state.split("\\|");
        if (parts.length != 6) {
            throw new BusinessException(ErrorCode.DISCORD_OAUTH_STATE_INVALID);
        }

        String type = parts[0];
        String boardId = parts[1];
        String userId = parts[2];
        String origin = parts[3];
        String timestamp = parts[4];
        String hmac = parts[5];

        // Verify HMAC
        String dataToSign = type + "|" + boardId + "|" + userId + "|" + origin + "|" + timestamp;
        String expectedHmac = computeHmac(dataToSign);
        if (!expectedHmac.equals(hmac)) {
            throw new BusinessException(ErrorCode.DISCORD_OAUTH_STATE_INVALID);
        }

        // Check expiry
        long stateTime = Long.parseLong(timestamp);
        if (Instant.now().getEpochSecond() - stateTime > STATE_EXPIRY_SECONDS) {
            throw new BusinessException(ErrorCode.DISCORD_OAUTH_STATE_INVALID);
        }

        // Resolve origin
        String resolvedOrigin = FrontendOriginResolver.resolve(origin, frontendUrl);

        // Exchange code for tokens (use dynamic redirect URI matching the one used in OAuth URL)
        String dynamicRedirectUri = resolveRedirectUri(origin);
        Map<String, Object> tokenResponse = discordBotService.exchangeCodeForTokens(code, dynamicRedirectUri);
        if (tokenResponse == null) {
            throw new BusinessException(ErrorCode.DISCORD_OAUTH_FAILED);
        }
        String accessToken = (String) tokenResponse.get("access_token");
        String refreshToken = (String) tokenResponse.get("refresh_token");
        Object expiresInObj = tokenResponse.get("expires_in");
        long expiresIn = expiresInObj instanceof Number ? ((Number) expiresInObj).longValue() : 604800;
        if (accessToken == null) {
            throw new BusinessException(ErrorCode.DISCORD_OAUTH_FAILED);
        }

        if ("bot_install".equals(type)) {
            return handleBotInstall(tokenResponse, boardId, userId, resolvedOrigin);
        } else {
            return handleUserLink(accessToken, refreshToken, expiresIn, userId, boardId, resolvedOrigin);
        }
    }

    /**
     * Get bot config for a board.
     */
    public DiscordResponse.BotConfig getBotConfig(String boardId) {
        return botConfigRepository.findByBoardId(boardId)
                .map(config -> DiscordResponse.BotConfig.builder()
                        .boardId(config.getBoard().getId())
                        .guildId(config.getGuildId())
                        .guildName(config.getGuildName())
                        .channelId(config.getChannelId())
                        .channelName(config.getChannelName())
                        .botConnected(true)
                        .installedBy(config.getInstalledBy().getName())
                        .createdAt(config.getCreatedAt() != null ? config.getCreatedAt() + "Z" : null)
                        .build())
                .orElse(DiscordResponse.BotConfig.builder()
                        .boardId(boardId)
                        .botConnected(false)
                        .build());
    }

    /**
     * Remove bot config from a board.
     */
    @Transactional
    public void deleteBotConfig(String boardId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        validateDiscordAccess(boardId);

        if (!botConfigRepository.existsByBoardId(boardId)) {
            throw new BusinessException(ErrorCode.DISCORD_BOT_NOT_CONFIGURED);
        }

        botConfigRepository.deleteByBoardId(boardId);
        log.info("Discord bot config removed from board {} by user {}", boardId, userId);
    }

    /**
     * Get user's Discord link status.
     */
    public DiscordResponse.UserLinkStatus getUserLink(String userId) {
        return userLinkRepository.findByUserId(userId)
                .map(link -> DiscordResponse.UserLinkStatus.builder()
                        .linked(true)
                        .discordUserId(link.getDiscordUserId())
                        .discordUsername(link.getDiscordUsername())
                        .build())
                .orElse(DiscordResponse.UserLinkStatus.builder()
                        .linked(false)
                        .build());
    }

    /**
     * Remove user's Discord link.
     */
    @Transactional
    public void unlinkUser(String userId) {
        if (!userLinkRepository.existsByUserId(userId)) {
            throw new BusinessException(ErrorCode.DISCORD_USER_NOT_LINKED);
        }

        userLinkRepository.deleteByUserId(userId);
        log.info("Discord account unlinked for user {}", userId);
    }

    /**
     * Get available text channels via bot.
     */
    public List<DiscordResponse.ChannelInfo> getChannels(String boardId) {
        DiscordBotConfig config = botConfigRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.DISCORD_BOT_NOT_CONFIGURED));

        List<Map<String, Object>> channels = discordBotService.getGuildChannels(config.getGuildId());

        return channels.stream()
                .map(ch -> DiscordResponse.ChannelInfo.builder()
                        .id((String) ch.get("id"))
                        .name((String) ch.get("name"))
                        .type(ch.get("type") != null ? ((Number) ch.get("type")).intValue() : 0)
                        .build())
                .toList();
    }

    /**
     * Set the notification channel for a board.
     */
    @Transactional
    public void updateChannel(String boardId, String userId, String channelId) {
        boardService.checkAdminOrAbove(boardId, userId);
        validateDiscordAccess(boardId);

        DiscordBotConfig config = botConfigRepository.findByBoardId(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.DISCORD_BOT_NOT_CONFIGURED));

        // Get channel name from Discord API
        List<Map<String, Object>> channels = discordBotService.getGuildChannels(config.getGuildId());
        String channelName = channels.stream()
                .filter(ch -> channelId.equals(ch.get("id")))
                .map(ch -> (String) ch.get("name"))
                .findFirst()
                .orElse(null);

        config.updateChannel(channelId, channelName);
        botConfigRepository.save(config);
        log.info("Discord notification channel updated to {} for board {}", channelId, boardId);
    }

    /**
     * Get all members' Discord link status for a board.
     */
    public List<DiscordResponse.MemberStatus> getMemberStatuses(String boardId) {
        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
        List<String> memberUserIds = members.stream()
                .map(bm -> bm.getUser().getId())
                .toList();

        Map<String, DiscordUserLink> linkMap = userLinkRepository.findByUserIdIn(memberUserIds).stream()
                .collect(Collectors.toMap(link -> link.getUser().getId(), link -> link));

        return members.stream()
                .map(bm -> {
                    DiscordUserLink link = linkMap.get(bm.getUser().getId());
                    return DiscordResponse.MemberStatus.builder()
                            .userId(bm.getUser().getId())
                            .linked(link != null)
                            .discordUsername(link != null ? link.getDiscordUsername() : null)
                            .enabled(link != null)
                            .build();
                })
                .toList();
    }

    /**
     * Send a test DM to the current user.
     */
    public DiscordResponse.TestResult testNotification(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        validateDiscordAccess(boardId);

        DiscordUserLink userLink = userLinkRepository.findByUserId(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.DISCORD_USER_NOT_LINKED));

        try {
            Map<String, Object> embed = new LinkedHashMap<>();
            embed.put("title", "\uD83D\uDD14 Test Notification");
            embed.put("description", "BRIDGE Discord Bot 연동 테스트 메시지입니다.");
            embed.put("color", 0x6366F1);
            embed.put("fields", List.of(
                    Map.of("name", "Board", "value", "Test", "inline", true)
            ));
            embed.put("footer", Map.of("text", "BRIDGE SPOTS"));
            embed.put("timestamp", Instant.now().toString());

            String boardUrl = frontendUrl + "/boards/" + boardId;
            Map<String, Object> payload = Map.of(
                    "embeds", List.of(embed),
                    "components", List.of(Map.of(
                            "type", 1,
                            "components", List.of(Map.of(
                                    "type", 2,
                                    "style", 5,
                                    "label", "\uBCF4\uB4DC\uC5D0\uC11C \uBCF4\uAE30",
                                    "url", boardUrl
                            ))
                    ))
            );

            discordBotService.sendDirectMessage(userLink.getDiscordUserId(), payload);

            log.info("Discord test DM sent to user {} on board {}", userId, boardId);
            return DiscordResponse.TestResult.builder()
                    .success(true)
                    .message("테스트 메시지가 전송되었습니다")
                    .build();
        } catch (Exception e) {
            log.error("Discord test DM failed for user {} on board {}: {}", userId, boardId, e.getMessage(), e);
            String detail = e.getMessage() != null ? e.getMessage() : "알 수 없는 오류";
            return DiscordResponse.TestResult.builder()
                    .success(false)
                    .message("Discord DM 전송에 실패했습니다: " + detail)
                    .build();
        }
    }

    // --- Private helpers ---

    private String handleBotInstall(Map<String, Object> tokenResponse, String boardId, String userId, String resolvedOrigin) {
        // Extract guild info from the token response
        @SuppressWarnings("unchecked")
        Map<String, Object> guild = (Map<String, Object>) tokenResponse.get("guild");
        if (guild == null) {
            throw new BusinessException(ErrorCode.DISCORD_OAUTH_FAILED);
        }

        String guildId = (String) guild.get("id");
        String guildName = (String) guild.get("name");

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // Upsert bot config
        DiscordBotConfig config = botConfigRepository.findByBoardId(boardId).orElse(null);
        if (config != null) {
            config.updateGuildInfo(guildId, guildName);
        } else {
            config = DiscordBotConfig.builder()
                    .board(board)
                    .guildId(guildId)
                    .guildName(guildName)
                    .installedBy(user)
                    .build();
        }
        botConfigRepository.save(config);

        log.info("Discord bot installed for board {} by user {}, guild {}", boardId, userId, guildId);

        // Redirect to frontend settings page
        return resolvedOrigin + "/boards/" + boardId + "?view=settings&tab=discord&status=bot_installed";
    }

    private String handleUserLink(String accessToken, String refreshToken, long expiresIn, String userId, String boardId, String resolvedOrigin) {
        // Get Discord user info
        Map<String, Object> userInfo = discordBotService.getUserInfo(accessToken);
        if (userInfo == null) {
            throw new BusinessException(ErrorCode.DISCORD_OAUTH_FAILED);
        }
        String discordUserId = (String) userInfo.get("id");
        String discordUsername = (String) userInfo.get("username");

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // Check if already linked
        Optional<DiscordUserLink> existingLink = userLinkRepository.findByUserId(userId);
        LocalDateTime tokenExpiresAt = LocalDateTime.now(ZoneOffset.UTC).plusSeconds(expiresIn);

        if (existingLink.isPresent()) {
            DiscordUserLink link = existingLink.get();
            link.updateTokens(
                    tokenEncryptor.encrypt(accessToken),
                    refreshToken != null ? tokenEncryptor.encrypt(refreshToken) : null,
                    tokenExpiresAt);
            link.updateUsername(discordUsername);
            userLinkRepository.save(link);
        } else {
            // Check if this Discord account is already linked to another user
            if (userLinkRepository.findByDiscordUserId(discordUserId).isPresent()) {
                throw new BusinessException(ErrorCode.DISCORD_USER_ALREADY_LINKED);
            }

            DiscordUserLink link = DiscordUserLink.builder()
                    .user(user)
                    .discordUserId(discordUserId)
                    .discordUsername(discordUsername)
                    .accessToken(tokenEncryptor.encrypt(accessToken))
                    .refreshToken(refreshToken != null ? tokenEncryptor.encrypt(refreshToken) : null)
                    .tokenExpiresAt(tokenExpiresAt)
                    .build();
            userLinkRepository.save(link);
        }

        log.info("Discord account linked for user {}, discordUser {}", userId, discordUserId);

        // Redirect to frontend settings page
        return resolvedOrigin + "/boards/" + boardId + "?view=settings&tab=discord&status=user_linked";
    }

    private void validateDiscordAccess(String boardId) {
        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        if (!board.canAccessDiscord()) {
            throw new BusinessException(ErrorCode.DISCORD_PREMIUM_REQUIRED);
        }
    }

    private String generateState(String type, String boardId, String userId, String origin) {
        String timestamp = String.valueOf(Instant.now().getEpochSecond());
        String data = type + "|" + boardId + "|" + userId + "|" + origin + "|" + timestamp;
        String hmac = computeHmac(data);
        return data + "|" + hmac;
    }

    private String resolveRedirectUri(String origin) {
        try {
            URI configured = URI.create(redirectUri);
            String apiBase = FrontendOriginResolver.resolveApiBase(origin, null);
            if (apiBase == null) {
                return redirectUri;
            }
            URI apiUri = URI.create(apiBase);
            return new URI(apiUri.getScheme(), apiUri.getAuthority(), configured.getPath(),
                    configured.getQuery(), configured.getFragment()).toString();
        } catch (Exception e) {
            return redirectUri;
        }
    }

    private String computeHmac(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] rawHmac = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(rawHmac);
        } catch (Exception e) {
            throw new RuntimeException("Failed to compute HMAC", e);
        }
    }
}
