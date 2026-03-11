package com.kanban.domain.integration.slack.controller;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.integration.FrontendOriginResolver;
import com.kanban.domain.integration.slack.SlackInstallScope;
import com.kanban.domain.integration.slack.SlackInstallation;
import com.kanban.domain.integration.slack.SlackInstallationRepository;
import com.kanban.domain.integration.slack.dto.SlackAppRequest;
import com.kanban.domain.integration.slack.dto.SlackAppResponse;
import com.kanban.domain.integration.slack.service.SlackOAuthService;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/v1/slack")
@RequiredArgsConstructor
public class SlackOAuthController {

    private final SlackOAuthService slackOAuthService;
    private final SlackInstallationRepository installationRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    /**
     * Get Slack OAuth install URL
     */
    @GetMapping("/oauth/install")
    public ResponseEntity<SlackAppResponse.InstallUrl> getInstallUrl(
            @RequestParam("scope") SlackInstallScope scope,
            @RequestParam("entity_id") String entityId,
            @RequestParam(value = "origin", required = false) String origin,
            @AuthenticationPrincipal UserPrincipal principal) {
        String resolvedOrigin = FrontendOriginResolver.resolve(origin, frontendUrl);
        return ResponseEntity.ok(slackOAuthService.generateInstallUrl(scope, entityId, principal.getUserId(), resolvedOrigin));
    }

    /**
     * OAuth callback from Slack (public endpoint - redirects to frontend)
     */
    @GetMapping("/oauth/callback")
    public void handleCallback(
            @RequestParam("code") String code,
            @RequestParam("state") String state,
            HttpServletResponse response) throws IOException {
        try {
            SlackAppResponse.OAuthCallback result = slackOAuthService.handleCallback(code, state);
            String redirectBase = FrontendOriginResolver.resolve(result.getOrigin(), frontendUrl);
            response.sendRedirect(redirectBase + result.getRedirectPath());
        } catch (Exception e) {
            log.warn("Slack OAuth callback failed: {}", e.getMessage(), e);
            String origin = slackOAuthService.safeExtractOriginFromState(state);
            String redirectBase = FrontendOriginResolver.resolve(origin, frontendUrl);
            String reason = e.getMessage() != null ? java.net.URLEncoder.encode(e.getMessage(), java.nio.charset.StandardCharsets.UTF_8) : "unknown";
            response.sendRedirect(redirectBase + "/auth/slack/callback?error=failed&reason=" + reason);
        }
    }

    /**
     * Get installation status for a board
     */
    @GetMapping("/app/status")
    public ResponseEntity<SlackAppResponse.Installation> getStatus(
            @RequestParam(value = "board_id", required = false) String boardId,
            @RequestParam(value = "organization_id", required = false) String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        SlackAppResponse.Installation installation;
        if (boardId != null) {
            installation = slackOAuthService.getInstallationStatus(boardId);
        } else if (orgId != null) {
            installation = slackOAuthService.getOrgInstallationStatus(orgId);
        } else {
            return ResponseEntity.badRequest().build();
        }
        if (installation == null) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok(installation);
    }

    /**
     * List Slack channels
     */
    @GetMapping("/app/channels")
    public ResponseEntity<SlackAppResponse.ChannelList> listChannels(
            @RequestParam(value = "board_id", required = false) String boardId,
            @RequestParam(value = "organization_id", required = false) String orgId,
            @RequestParam(value = "cursor", required = false) String cursor,
            @AuthenticationPrincipal UserPrincipal principal) {
        SlackInstallation installation = resolveInstallation(boardId, orgId);
        if (installation == null) {
            throw new BusinessException(ErrorCode.SLACK_APP_NOT_INSTALLED);
        }
        return ResponseEntity.ok(slackOAuthService.listChannels(installation, cursor));
    }

    /**
     * Set default notification channel
     */
    @PutMapping("/app/channel")
    public ResponseEntity<Void> setDefaultChannel(
            @RequestParam("installation_id") String installationId,
            @RequestBody SlackAppRequest.SetChannel request,
            @AuthenticationPrincipal UserPrincipal principal) {
        slackOAuthService.updateDefaultChannel(installationId, request.getChannelId(), request.getChannelName());
        return ResponseEntity.ok().build();
    }

    /**
     * Uninstall Slack App
     */
    @DeleteMapping("/app/{installationId}")
    public ResponseEntity<Void> uninstall(
            @PathVariable String installationId,
            @AuthenticationPrincipal UserPrincipal principal) {
        slackOAuthService.revokeInstallation(installationId, principal.getUserId());
        return ResponseEntity.ok().build();
    }

    // ---- User Link endpoints ----

    /**
     * Get Slack OAuth URL for individual user linking
     */
    @GetMapping("/oauth/user-link")
    public ResponseEntity<SlackAppResponse.InstallUrl> getUserLinkUrl(
            @RequestParam("board_id") String boardId,
            @RequestParam(value = "origin", required = false) String origin,
            @AuthenticationPrincipal UserPrincipal principal) {
        String resolvedOrigin = FrontendOriginResolver.resolve(origin, frontendUrl);
        return ResponseEntity.ok(slackOAuthService.generateUserLinkUrl(boardId, principal.getUserId(), resolvedOrigin));
    }

    /**
     * OAuth callback for user linking (public endpoint - redirects to frontend)
     */
    @GetMapping("/oauth/user-callback")
    public void handleUserLinkCallback(
            @RequestParam("code") String code,
            @RequestParam("state") String state,
            HttpServletResponse response) throws IOException {
        try {
            SlackAppResponse.UserLinkCallback result = slackOAuthService.handleUserLinkCallback(code, state);
            String redirectBase = FrontendOriginResolver.resolve(result.getOrigin(), frontendUrl);
            response.sendRedirect(redirectBase + result.getRedirectPath());
        } catch (Exception e) {
            log.warn("Slack OAuth user link callback failed: {}", e.getMessage(), e);
            String origin = slackOAuthService.safeExtractOriginFromState(state);
            String redirectBase = FrontendOriginResolver.resolve(origin, frontendUrl);
            response.sendRedirect(redirectBase + "/auth/slack/callback?error=user_link_failed");
        }
    }

    /**
     * Get current user's Slack link status
     */
    @GetMapping("/user/me")
    public ResponseEntity<SlackAppResponse.UserLinkStatus> getUserLinkStatus(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(slackOAuthService.getUserLinkStatus(principal.getUserId()));
    }

    /**
     * Unlink current user's Slack account
     */
    @DeleteMapping("/user/me")
    public ResponseEntity<Void> unlinkUser(@AuthenticationPrincipal UserPrincipal principal) {
        slackOAuthService.unlinkUser(principal.getUserId());
        return ResponseEntity.ok().build();
    }

    /**
     * Get all board members' Slack link statuses
     */
    @GetMapping("/user/statuses")
    public ResponseEntity<List<SlackAppResponse.MemberSlackStatus>> getMemberStatuses(
            @RequestParam("board_id") String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<String> memberUserIds = boardMemberRepository.findByBoardId(boardId).stream()
                .map(bm -> bm.getUser().getId())
                .toList();
        return ResponseEntity.ok(slackOAuthService.getMemberStatuses(boardId, memberUserIds));
    }

    private SlackInstallation resolveInstallation(String boardId, String orgId) {
        if (boardId != null) {
            Board board = boardRepository.findById(boardId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
            return slackOAuthService.findActiveInstallation(board).orElse(null);
        } else if (orgId != null) {
            return installationRepository.findActiveByOrganizationId(orgId).orElse(null);
        }
        return null;
    }
}
