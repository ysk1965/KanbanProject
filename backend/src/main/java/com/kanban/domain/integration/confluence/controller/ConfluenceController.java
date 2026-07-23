package com.kanban.domain.integration.confluence.controller;

import com.kanban.domain.integration.confluence.dto.ConfluenceRequest;
import com.kanban.domain.integration.confluence.dto.ConfluenceResponse;
import com.kanban.domain.integration.confluence.service.ConfluenceConnectionService;
import com.kanban.domain.integration.confluence.service.ConfluenceOAuthService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

/**
 * 보드별 Confluence 연동 API. JIRA와 <b>완전히 분리된</b> 경로다.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class ConfluenceController {

    private final ConfluenceOAuthService oauthService;
    private final ConfluenceConnectionService connectionService;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    // ── OAuth ───────────────────────────────────

    @GetMapping("/api/v1/boards/{boardId}/confluence/oauth/url")
    public ResponseEntity<ConfluenceResponse.OAuthUrl> oauthUrl(
            @PathVariable String boardId,
            @RequestParam(value = "origin", required = false) String origin,
            @AuthenticationPrincipal UserPrincipal principal) {
        String resolvedOrigin = (origin != null && !origin.isBlank()) ? origin : frontendUrl;
        return ResponseEntity.ok(
                oauthService.getAuthorizeUrl(boardId, principal.getUserId(), resolvedOrigin));
    }

    @GetMapping("/api/v1/confluence/oauth/callback")
    public ResponseEntity<Void> oauthCallback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error) {
        String redirect;
        if (code == null || error != null) {
            redirect = frontendUrl + "?confluence=oauth_error&reason="
                    + (error != null ? error : "denied");
        } else {
            try {
                redirect = oauthService.handleCallback(code, state);
            } catch (Exception e) {
                log.warn("Confluence OAuth 콜백 실패: {}", e.getMessage());
                redirect = frontendUrl + "?confluence=oauth_error&reason=callback_failed";
            }
        }
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, URI.create(redirect).toString())
                .build();
    }

    // ── 사이트 (JIRA와 다를 수 있으므로 직접 고른다) ──

    @GetMapping("/api/v1/boards/{boardId}/confluence/sites")
    public ResponseEntity<List<ConfluenceResponse.SiteRef>> sites(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(oauthService.getAccessibleSites(boardId, principal.getUserId()));
    }

    @PostMapping("/api/v1/boards/{boardId}/confluence/site")
    public ResponseEntity<ConfluenceResponse.Status> selectSite(
            @PathVariable String boardId,
            @Valid @RequestBody ConfluenceRequest.SelectSite request,
            @AuthenticationPrincipal UserPrincipal principal) {
        oauthService.finalizeSite(boardId, principal.getUserId(),
                request.getCloudId(), request.getBaseUrl(), request.getSiteName());
        return ResponseEntity.ok(connectionService.getStatus(boardId, principal.getUserId()));
    }

    // ── 스페이스 ────────────────────────────────

    @GetMapping("/api/v1/boards/{boardId}/confluence/spaces")
    public ResponseEntity<List<ConfluenceResponse.SpaceRef>> spaces(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(connectionService.listSpaces(boardId, principal.getUserId()));
    }

    @PutMapping("/api/v1/boards/{boardId}/confluence/spaces")
    public ResponseEntity<ConfluenceResponse.Status> selectSpaces(
            @PathVariable String boardId,
            @Valid @RequestBody ConfluenceRequest.SelectSpaces request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                connectionService.selectSpaces(boardId, principal.getUserId(), request));
    }

    @GetMapping("/api/v1/boards/{boardId}/confluence/status")
    public ResponseEntity<ConfluenceResponse.Status> status(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(connectionService.getStatus(boardId, principal.getUserId()));
    }

    @DeleteMapping("/api/v1/boards/{boardId}/confluence")
    public ResponseEntity<Void> disconnect(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        connectionService.disconnect(boardId, principal.getUserId());
        return ResponseEntity.noContent().build();
    }
}
