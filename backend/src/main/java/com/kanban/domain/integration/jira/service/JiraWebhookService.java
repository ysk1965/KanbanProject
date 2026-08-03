package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.integration.jira.JiraIntegrationConfig;
import com.kanban.domain.integration.jira.JiraIntegrationConfigRepository;
import com.kanban.global.websocket.WebSocketEventService;
import com.kanban.global.websocket.dto.BoardEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

/**
 * JIRA 웹훅 수신 처리 (Phase 4 근실시간 pull).
 *
 * <p>흐름: JIRA(웹훅/Automation) → {@code POST /api/v1/jira/webhook/{boardId}?token=…}
 * → 토큰 검증 → 해당 이슈 단건 pull → BRIDGE WebSocket 브로드캐스트 → 열린 개발자 화면 즉시 갱신.
 *
 * <p>웹훅 유실 대비 {@code JiraSyncScheduler.pullSync}(5분 폴링)를 백업으로 병행한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JiraWebhookService {

    private final JiraIntegrationConfigRepository configRepository;
    private final JiraImportService importService;
    private final WebSocketEventService webSocketEventService;

    /** 보드별 웹훅 토큰 검증 (활성 config + 토큰 일치). 빠른 동기 확인 — 컨트롤러가 401 판정에 사용. */
    public boolean verifyToken(String boardId, String token) {
        if (token == null || token.isBlank()) return false;
        return configRepository.findActiveByBoardId(boardId)
            .map(JiraIntegrationConfig::getWebhookToken)
            .filter(stored -> stored != null && stored.equals(token))
            .isPresent();
    }

    /** 웹훅 페이로드에서 이슈 키를 뽑아 단건 pull 후 브로드캐스트. 검증은 호출 측(컨트롤러)이 이미 통과시킴. */
    @Async
    public void process(String boardId, JsonNode payload) {
        try {
            String issueKey = extractIssueKey(payload);
            if (issueKey == null) {
                log.debug("JIRA webhook: no issue key in payload (board {})", boardId);
                return;
            }
            // 삭제 이벤트는 pull 대상이 아니다(단건 조회하면 404). 링크만 끊고 카드를 갱신한다.
            if (isDeletionEvent(payload)) {
                String taskId = importService.markIssueDeleted(boardId, issueKey);
                if (taskId == null) return;   // 미연동/이미 처리됨
                Map<String, Object> data = new HashMap<>();
                data.put("id", taskId);
                data.put("jira_deleted", true);
                webSocketEventService.sendBoardEvent(boardId, BoardEventType.TASK_UPDATED, "jira-sync", "JIRA", data);
                return;
            }

            String actorUserId = configRepository.findActiveByBoardId(boardId)
                .map(c -> c.getConnectedBy() != null ? c.getConnectedBy().getId() : null)
                .orElse(null);
            if (actorUserId == null) return;

            JiraImportService.PulledTask pulled = importService.syncSingleIssue(boardId, actorUserId, issueKey);
            if (pulled == null) return;   // 미연동/변경없음/오래된 이벤트

            Map<String, Object> data = new HashMap<>();
            data.put("id", pulled.taskId());
            data.put("block_id", pulled.blockId());
            data.put("block_name", pulled.blockName());
            data.put("position", pulled.position());
            data.put("completed", pulled.completed());
            data.put("qa_state", pulled.qaState());
            webSocketEventService.sendBoardEvent(boardId, BoardEventType.TASK_UPDATED, "jira-sync", "JIRA", data);
            log.info("JIRA webhook pull: board {} issue {} → task {}", boardId, issueKey, pulled.taskId());
        } catch (Exception e) {
            log.warn("JIRA webhook processing failed for board {}: {}", boardId, e.getMessage());
        }
    }

    /**
     * 이슈 삭제 이벤트 판정. 표준 웹훅은 {@code webhookEvent: "jira:issue_deleted"},
     * Automation 커스텀 바디는 {@code event: "deleted"} 처럼 보내는 경우가 있어 둘 다 받는다.
     */
    private boolean isDeletionEvent(JsonNode payload) {
        for (String field : new String[]{"webhookEvent", "webhook_event", "event", "issue_event_type_name"}) {
            if (payload.hasNonNull(field) && payload.get(field).asText().toLowerCase().contains("delet")) {
                return true;
            }
        }
        return false;
    }

    private String extractIssueKey(JsonNode payload) {
        if (payload == null) return null;
        JsonNode issue = payload.path("issue");
        if (issue.hasNonNull("key")) return issue.get("key").asText();
        if (payload.hasNonNull("key")) return payload.get("key").asText();     // Automation 커스텀 바디
        if (payload.hasNonNull("issue_key")) return payload.get("issue_key").asText();
        return null;
    }
}
