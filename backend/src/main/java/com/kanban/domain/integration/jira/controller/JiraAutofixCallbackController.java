package com.kanban.domain.integration.jira.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.integration.jira.service.JiraAutofixQueueService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 자동수정 러너 결과 수신. 공개 엔드포인트 — 보드별 시크릿 토큰으로 검증한다(SecurityConfig permit).
 *
 * <p>러너 워크플로가 마지막 단계에서 이 URL로 POST한다:
 * {@code POST /api/v1/jira/autofix/callback/{boardId}} + {@code Authorization: Bearer <token>}
 *
 * <p>러너가 죽어 콜백이 영영 오지 않는 경우가 정상 시나리오에 포함되므로, 이 엔드포인트는
 * 신뢰할 수 있는 유일한 경로가 아니다 — 타임아웃 회수가 백스톱으로 항상 돈다.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class JiraAutofixCallbackController {

    private final JiraAutofixQueueService queueService;

    @PostMapping("/api/v1/jira/autofix/callback/{boardId}")
    public ResponseEntity<Void> receive(
            @PathVariable String boardId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "token", required = false) String tokenParam,
            @RequestBody(required = false) JsonNode payload) {

        String token = extractBearer(authorization);
        if (token == null) token = tokenParam;

        if (!queueService.verifyCallbackToken(boardId, token)) {
            log.warn("Autofix callback rejected (board={})", boardId);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        queueService.handleCallback(boardId, payload);
        return ResponseEntity.ok().build();
    }

    private String extractBearer(String header) {
        if (header == null) return null;
        String prefix = "Bearer ";
        return header.startsWith(prefix) ? header.substring(prefix.length()).trim() : null;
    }
}
