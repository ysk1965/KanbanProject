package com.kanban.domain.integration.jira.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.integration.jira.service.JiraWebhookService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * JIRA 웹훅 수신 (Phase 4). 공개 엔드포인트 — 보드별 시크릿 토큰으로 검증한다(SecurityConfig permit).
 *
 * <p>JIRA 웹훅/Automation 규칙에서 이 URL로 POST하도록 설정:
 * {@code POST /api/v1/jira/webhook/{boardId}?token=<webhookToken>}
 * (또는 헤더 {@code X-Jira-Webhook-Token}). 처리는 비동기라 즉시 200을 돌려준다.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class JiraWebhookController {

    private final JiraWebhookService webhookService;

    @PostMapping("/api/v1/jira/webhook/{boardId}")
    public ResponseEntity<Void> receive(
            @PathVariable String boardId,
            @RequestParam(value = "token", required = false) String tokenParam,
            @RequestHeader(value = "X-Jira-Webhook-Token", required = false) String tokenHeader,
            @RequestBody(required = false) JsonNode payload) {
        String token = tokenParam != null ? tokenParam : tokenHeader;
        if (!webhookService.verifyToken(boardId, token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        webhookService.process(boardId, payload);   // @Async — 응답을 막지 않음
        return ResponseEntity.ok().build();
    }
}
