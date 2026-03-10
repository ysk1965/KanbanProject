package com.kanban.domain.integration.discord.controller;

import com.kanban.domain.integration.discord.dto.DiscordRequest;
import com.kanban.domain.integration.discord.dto.DiscordResponse;
import com.kanban.domain.integration.discord.service.DiscordService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class DiscordController {

    private final DiscordService discordService;

    /**
     * Generate OAuth2 URL for bot installation or user linking.
     */
    @GetMapping("/api/v1/boards/{boardId}/discord/oauth-url")
    public ResponseEntity<DiscordResponse.OAuthUrl> getOAuthUrl(
            @PathVariable String boardId,
            @RequestParam String type,
            @AuthenticationPrincipal UserPrincipal principal) {
        DiscordResponse.OAuthUrl response = discordService.getOAuthUrl(boardId, principal.getUserId(), type);
        return ResponseEntity.ok(response);
    }

    /**
     * OAuth2 callback from Discord (no boardId — Discord redirects here directly).
     */
    @GetMapping("/api/v1/discord/oauth/callback")
    public ResponseEntity<Void> handleOAuthCallback(
            @RequestParam String code,
            @RequestParam String state) {
        String redirectUrl = discordService.handleOAuthCallback(code, state);
        HttpHeaders headers = new HttpHeaders();
        headers.setLocation(URI.create(redirectUrl));
        return new ResponseEntity<>(headers, HttpStatus.FOUND);
    }

    /**
     * Get board's Discord bot config.
     */
    @GetMapping("/api/v1/boards/{boardId}/discord/config")
    public ResponseEntity<DiscordResponse.BotConfig> getBotConfig(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        DiscordResponse.BotConfig response = discordService.getBotConfig(boardId);
        return ResponseEntity.ok(response);
    }

    /**
     * Remove bot from board.
     */
    @DeleteMapping("/api/v1/boards/{boardId}/discord/config")
    public ResponseEntity<Map<String, String>> deleteBotConfig(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        discordService.deleteBotConfig(boardId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "Discord Bot이 제거되었습니다"));
    }

    /**
     * Get current user's Discord link status.
     */
    @GetMapping("/api/v1/boards/{boardId}/discord/me")
    public ResponseEntity<DiscordResponse.UserLinkStatus> getUserLink(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        DiscordResponse.UserLinkStatus response = discordService.getUserLink(principal.getUserId());
        return ResponseEntity.ok(response);
    }

    /**
     * Unlink current user's Discord account.
     */
    @DeleteMapping("/api/v1/boards/{boardId}/discord/me")
    public ResponseEntity<Map<String, String>> unlinkUser(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        discordService.unlinkUser(principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "Discord 계정 연동이 해제되었습니다"));
    }

    /**
     * Get available text channels via bot.
     */
    @GetMapping("/api/v1/boards/{boardId}/discord/channels")
    public ResponseEntity<List<DiscordResponse.ChannelInfo>> getChannels(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<DiscordResponse.ChannelInfo> channels = discordService.getChannels(boardId);
        return ResponseEntity.ok(channels);
    }

    /**
     * Set the notification channel for a board.
     */
    @PutMapping("/api/v1/boards/{boardId}/discord/channel")
    public ResponseEntity<Map<String, String>> updateChannel(
            @PathVariable String boardId,
            @RequestBody DiscordRequest.UpdateChannel request,
            @AuthenticationPrincipal UserPrincipal principal) {
        discordService.updateChannel(boardId, principal.getUserId(), request.getChannelId());
        return ResponseEntity.ok(Map.of("message", "알림 채널이 설정되었습니다"));
    }

    /**
     * Get all members' Discord link statuses.
     */
    @GetMapping("/api/v1/boards/{boardId}/discord/statuses")
    public ResponseEntity<List<DiscordResponse.MemberStatus>> getMemberStatuses(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<DiscordResponse.MemberStatus> statuses = discordService.getMemberStatuses(boardId);
        return ResponseEntity.ok(statuses);
    }

    /**
     * Send test DM to the current user.
     */
    @PostMapping("/api/v1/boards/{boardId}/discord/test")
    public ResponseEntity<DiscordResponse.TestResult> testNotification(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        DiscordResponse.TestResult result = discordService.testNotification(boardId, principal.getUserId());
        return ResponseEntity.ok(result);
    }
}
