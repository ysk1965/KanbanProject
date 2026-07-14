package com.kanban.domain.integration.jira.controller;

import com.kanban.domain.integration.jira.dto.JiraRequest;
import com.kanban.domain.integration.jira.dto.JiraResponse;
import com.kanban.domain.integration.jira.service.JiraConnectionService;
import com.kanban.domain.integration.jira.service.JiraImportService;
import com.kanban.domain.integration.jira.service.JiraOAuthService;
import com.kanban.global.security.UserPrincipal;
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
import java.util.Map;

/**
 * 보드별 JIRA 연동 API. 경로 규약: /api/v1/boards/{boardId}/jira/*
 * (가져오기 엔드포인트는 JiraImportService와 함께 추가 예정)
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class JiraController {

    private final JiraConnectionService connectionService;
    private final JiraImportService importService;
    private final JiraOAuthService oauthService;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    // ── OAuth (Atlassian으로 연결) ──────────────────

    @GetMapping("/api/v1/boards/{boardId}/jira/oauth/url")
    public ResponseEntity<JiraResponse.OAuthUrl> oauthUrl(
            @PathVariable String boardId,
            @RequestParam(value = "origin", required = false) String origin,
            @AuthenticationPrincipal UserPrincipal principal) {
        String resolvedOrigin = (origin != null && !origin.isBlank()) ? origin : frontendUrl;
        return ResponseEntity.ok(oauthService.getAuthorizeUrl(boardId, principal.getUserId(), resolvedOrigin));
    }

    @GetMapping("/api/v1/jira/oauth/callback")
    public ResponseEntity<Void> oauthCallback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error) {
        String redirect;
        if (code == null || error != null) {
            redirect = frontendUrl + "?jira=oauth_error&reason=" + (error != null ? error : "denied");
        } else {
            try {
                redirect = oauthService.handleCallback(code, state);
            } catch (Exception e) {
                log.warn("JIRA OAuth callback failed: {}", e.getMessage());
                redirect = frontendUrl + "?jira=oauth_error&reason=error";
            }
        }
        HttpHeaders headers = new HttpHeaders();
        headers.setLocation(URI.create(redirect));
        return new ResponseEntity<>(headers, HttpStatus.FOUND);
    }

    @GetMapping("/api/v1/boards/{boardId}/jira/oauth/sites")
    public ResponseEntity<List<JiraResponse.SiteRef>> oauthSites(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(oauthService.getAccessibleSites(boardId, principal.getUserId()));
    }

    @PostMapping("/api/v1/boards/{boardId}/jira/oauth/finalize")
    public ResponseEntity<JiraResponse.Status> oauthFinalize(
            @PathVariable String boardId,
            @RequestBody JiraRequest.Finalize request,
            @AuthenticationPrincipal UserPrincipal principal) {
        oauthService.finalizeTarget(boardId, principal.getUserId(),
            request.getCloudId(), request.getBaseUrl(), request.getProjectKey());
        return ResponseEntity.ok(connectionService.getStatus(boardId, principal.getUserId()));
    }

    @PostMapping("/api/v1/boards/{boardId}/jira/import")
    public ResponseEntity<JiraResponse.ImportResult> importIssues(
            @PathVariable String boardId,
            @RequestBody(required = false) JiraRequest.Import request,
            @AuthenticationPrincipal UserPrincipal principal) {
        JiraRequest.Import req = request != null ? request : new JiraRequest.Import(null, false);
        return ResponseEntity.ok(importService.importIssues(boardId, principal.getUserId(), req));
    }

    @PostMapping("/api/v1/boards/{boardId}/jira/connect")
    public ResponseEntity<JiraResponse.Status> connect(
            @PathVariable String boardId,
            @RequestBody JiraRequest.Connect request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(connectionService.connect(boardId, principal.getUserId(), request));
    }

    @PostMapping("/api/v1/boards/{boardId}/jira/test")
    public ResponseEntity<JiraResponse.TestResult> test(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(connectionService.testConnection(boardId, principal.getUserId()));
    }

    @GetMapping("/api/v1/boards/{boardId}/jira/meta")
    public ResponseEntity<JiraResponse.Meta> meta(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(connectionService.getMeta(boardId, principal.getUserId()));
    }

    @PutMapping("/api/v1/boards/{boardId}/jira/mapping")
    public ResponseEntity<JiraResponse.Status> updateMapping(
            @PathVariable String boardId,
            @RequestBody JiraRequest.Mapping request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(connectionService.updateMapping(boardId, principal.getUserId(), request));
    }

    @PutMapping("/api/v1/boards/{boardId}/jira/write-back")
    public ResponseEntity<JiraResponse.Status> updateWriteBack(
            @PathVariable String boardId,
            @RequestBody JiraRequest.WriteBack request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(connectionService.updateWriteBack(boardId, principal.getUserId(), request));
    }

    @GetMapping("/api/v1/boards/{boardId}/jira/status")
    public ResponseEntity<JiraResponse.Status> status(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(connectionService.getStatus(boardId, principal.getUserId()));
    }

    @DeleteMapping("/api/v1/boards/{boardId}/jira")
    public ResponseEntity<Map<String, String>> disconnect(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        connectionService.disconnect(boardId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "JIRA 연동이 해제되었습니다"));
    }
}
