package com.kanban.domain.integration.discord.service;

import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class DiscordBotService {

    private static final String BASE_URL = "https://discord.com/api/v10";

    private final RestTemplate restTemplate;
    private final String botToken;
    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;

    public DiscordBotService(
            RestTemplate restTemplate,
            @Value("${discord.bot-token:}") String botToken,
            @Value("${discord.client-id:}") String clientId,
            @Value("${discord.client-secret:}") String clientSecret,
            @Value("${discord.redirect-uri:}") String redirectUri) {
        this.restTemplate = restTemplate;
        this.botToken = botToken;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        log.info("DiscordBotService initialized: botToken={}, clientId={}, redirectUri={}",
                botToken != null && !botToken.isBlank() ? "SET(" + botToken.length() + " chars)" : "EMPTY",
                clientId != null && !clientId.isBlank() ? "SET" : "EMPTY",
                redirectUri);
    }

    /**
     * Send a DM to a Discord user via the Bot.
     * Flow: POST /users/@me/channels to create/get DM channel, then POST message.
     */
    public void sendDirectMessage(String discordUserId, Map<String, Object> payload) {
        try {
            // Step 1: Create/get DM channel
            HttpHeaders headers = botHeaders();
            Map<String, Object> dmChannelBody = Map.of("recipient_id", discordUserId);
            HttpEntity<Map<String, Object>> dmRequest = new HttpEntity<>(dmChannelBody, headers);

            ResponseEntity<Map<String, Object>> dmResponse = restTemplate.exchange(
                    BASE_URL + "/users/@me/channels",
                    HttpMethod.POST,
                    dmRequest,
                    new ParameterizedTypeReference<>() {}
            );

            if (dmResponse.getBody() == null || !dmResponse.getBody().containsKey("id")) {
                throw new BusinessException(ErrorCode.DISCORD_API_ERROR);
            }

            String channelId = (String) dmResponse.getBody().get("id");

            // Step 2: Send message to the DM channel
            sendChannelMessage(channelId, payload);

            log.debug("Discord DM sent to user {}", discordUserId);
        } catch (BusinessException e) {
            throw e;
        } catch (HttpStatusCodeException e) {
            log.error("Discord DM API error for user {}: status={}, body={}", discordUserId, e.getStatusCode(), e.getResponseBodyAsString());
            throw new BusinessException(ErrorCode.DISCORD_API_ERROR);
        } catch (Exception e) {
            log.error("Failed to send Discord DM to user {}: {}", discordUserId, e.getMessage(), e);
            throw new BusinessException(ErrorCode.DISCORD_API_ERROR);
        }
    }

    /**
     * Send a message to a specific Discord channel via the Bot.
     */
    public void sendChannelMessage(String channelId, Map<String, Object> payload) {
        try {
            HttpHeaders headers = botHeaders();
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);

            restTemplate.postForEntity(
                    BASE_URL + "/channels/" + channelId + "/messages",
                    entity,
                    String.class
            );

            log.debug("Discord message sent to channel {}", channelId);
        } catch (HttpStatusCodeException e) {
            log.error("Discord channel message API error for {}: status={}, body={}", channelId, e.getStatusCode(), e.getResponseBodyAsString());
            throw new BusinessException(ErrorCode.DISCORD_API_ERROR);
        } catch (Exception e) {
            log.error("Failed to send Discord channel message to {}: {}", channelId, e.getMessage(), e);
            throw new BusinessException(ErrorCode.DISCORD_API_ERROR);
        }
    }

    /**
     * Get list of text channels in a guild.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getGuildChannels(String guildId) {
        try {
            HttpHeaders headers = botHeaders();
            HttpEntity<Void> entity = new HttpEntity<>(headers);

            ResponseEntity<List<Map<String, Object>>> response = restTemplate.exchange(
                    BASE_URL + "/guilds/" + guildId + "/channels",
                    HttpMethod.GET,
                    entity,
                    new ParameterizedTypeReference<>() {}
            );

            if (response.getBody() == null) {
                return List.of();
            }

            // Filter to text channels only (type 0 = GUILD_TEXT)
            return response.getBody().stream()
                    .filter(ch -> {
                        Object type = ch.get("type");
                        return type != null && (type.equals(0) || type.equals(0L));
                    })
                    .toList();
        } catch (Exception e) {
            log.warn("Failed to get guild channels for {}: {}", guildId, e.getMessage());
            throw new BusinessException(ErrorCode.DISCORD_API_ERROR);
        }
    }

    /**
     * Get guild info (name, icon).
     */
    public Map<String, Object> getGuildInfo(String guildId) {
        try {
            HttpHeaders headers = botHeaders();
            HttpEntity<Void> entity = new HttpEntity<>(headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    BASE_URL + "/guilds/" + guildId,
                    HttpMethod.GET,
                    entity,
                    new ParameterizedTypeReference<>() {}
            );

            return response.getBody();
        } catch (Exception e) {
            log.warn("Failed to get guild info for {}: {}", guildId, e.getMessage());
            throw new BusinessException(ErrorCode.DISCORD_API_ERROR);
        }
    }

    /**
     * Get Discord user info from an OAuth2 access token.
     */
    public Map<String, Object> getUserInfo(String accessToken) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(accessToken);
            HttpEntity<Void> entity = new HttpEntity<>(headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    BASE_URL + "/users/@me",
                    HttpMethod.GET,
                    entity,
                    new ParameterizedTypeReference<>() {}
            );

            return response.getBody();
        } catch (Exception e) {
            log.warn("Failed to get Discord user info: {}", e.getMessage());
            throw new BusinessException(ErrorCode.DISCORD_OAUTH_FAILED);
        }
    }

    /**
     * Exchange OAuth2 authorization code for tokens.
     */
    public Map<String, Object> exchangeCodeForTokens(String code) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

            MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
            params.add("client_id", clientId);
            params.add("client_secret", clientSecret);
            params.add("grant_type", "authorization_code");
            params.add("code", code);
            params.add("redirect_uri", redirectUri);

            HttpEntity<MultiValueMap<String, String>> entity = new HttpEntity<>(params, headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    BASE_URL + "/oauth2/token",
                    HttpMethod.POST,
                    entity,
                    new ParameterizedTypeReference<>() {}
            );

            return response.getBody();
        } catch (Exception e) {
            log.warn("Failed to exchange Discord OAuth code: {}", e.getMessage());
            throw new BusinessException(ErrorCode.DISCORD_OAUTH_FAILED);
        }
    }

    /**
     * Refresh an OAuth2 access token.
     */
    public Map<String, Object> refreshAccessToken(String refreshToken) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

            MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
            params.add("client_id", clientId);
            params.add("client_secret", clientSecret);
            params.add("grant_type", "refresh_token");
            params.add("refresh_token", refreshToken);

            HttpEntity<MultiValueMap<String, String>> entity = new HttpEntity<>(params, headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    BASE_URL + "/oauth2/token",
                    HttpMethod.POST,
                    entity,
                    new ParameterizedTypeReference<>() {}
            );

            return response.getBody();
        } catch (Exception e) {
            log.warn("Failed to refresh Discord token: {}", e.getMessage());
            throw new BusinessException(ErrorCode.DISCORD_OAUTH_FAILED);
        }
    }

    private HttpHeaders botHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Authorization", "Bot " + botToken);
        return headers;
    }
}
