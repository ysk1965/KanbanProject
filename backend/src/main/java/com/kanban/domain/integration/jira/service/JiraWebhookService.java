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
 * → 토큰 검증 → 이벤트 종류별 분기 → BRIDGE WebSocket 브로드캐스트 → 열린 개발자 화면 즉시 갱신.
 *
 * <p>분기: 코멘트 이벤트({@code comment_created/deleted}) → 댓글 동기화,
 * 이슈 삭제 → 연동 해제(soft-unlink), 그 외 → 이슈 단건 pull.
 *
 * <p>웹훅 유실 대비 {@code JiraSyncScheduler.pullSync}(2분 폴링)를 백업으로 병행한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JiraWebhookService {

    private final JiraIntegrationConfigRepository configRepository;
    private final JiraImportService importService;
    private final JiraCommentSyncService commentSyncService;
    private final WebSocketEventService webSocketEventService;

    /** 보드별 웹훅 토큰 검증 (활성 config + 토큰 일치). 빠른 동기 확인 — 컨트롤러가 401 판정에 사용. */
    public boolean verifyToken(String boardId, String token) {
        if (token == null || token.isBlank()) return false;
        return configRepository.findActiveByBoardId(boardId)
            .map(JiraIntegrationConfig::getWebhookToken)
            .filter(stored -> stored != null && stored.equals(token))
            .isPresent();
    }

    /** 이벤트 종류로 분기해 처리. 검증은 호출 측(컨트롤러)이 이미 통과시킴. */
    @Async
    public void process(String boardId, JsonNode payload) {
        try {
            String event = eventName(payload);
            String issueKey = extractIssueKey(payload);

            // 코멘트 이벤트를 가장 먼저 걸러낸다. "comment_deleted"에도 'delet'이 들어 있어
            // 아래 이슈 삭제 분기가 먼저 잡으면, 코멘트 하나 지웠을 뿐인데 이슈 전체가 연동 해제된다.
            if (event.contains("comment")) {
                handleCommentEvent(boardId, event, issueKey, payload);
                return;
            }

            if (issueKey == null) {
                log.debug("JIRA webhook: no issue key in payload (board {})", boardId);
                return;
            }
            // 삭제 이벤트는 pull 대상이 아니다(단건 조회하면 404). 링크만 끊고 카드를 갱신한다.
            if (isIssueDeletion(event)) {
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

    /** 코멘트 이벤트 처리 — 생성/수정은 BRIDGE 댓글로 반영, 삭제는 매핑된 BRIDGE 댓글 삭제. */
    private void handleCommentEvent(String boardId, String event, String issueKey, JsonNode payload) {
        JsonNode commentNode = payload.path("comment");

        if (event.contains("delet")) {
            String jiraCommentId = commentNode.path("id").asText(null);
            if (jiraCommentId == null) jiraCommentId = payload.path("comment_id").asText(null);  // Automation 커스텀 바디
            if (jiraCommentId == null) {
                log.debug("JIRA webhook: comment 삭제 이벤트에 코멘트 id 없음 (board {})", boardId);
                return;
            }
            commentSyncService.applyRemoteDelete(boardId, jiraCommentId);
            return;
        }

        if (issueKey == null || commentNode.isMissingNode() || commentNode.isNull()) {
            log.debug("JIRA webhook: comment 이벤트에 이슈키/본문 없음 (board {})", boardId);
            return;
        }
        // v1은 본문 수정 동기화를 하지 않는다 — comment_updated는 놓친 생성의 보충으로만 동작(멱등).
        commentSyncService.applyRemoteCreate(boardId, issueKey, commentNode);
    }

    /**
     * 이벤트 이름(소문자). 표준 웹훅은 {@code webhookEvent}, Automation 커스텀 바디는
     * {@code event} 등으로 보내 첫 번째로 채워진 값을 쓴다.
     */
    private String eventName(JsonNode payload) {
        if (payload == null) return "";
        for (String field : new String[]{"webhookEvent", "webhook_event", "event", "issue_event_type_name"}) {
            if (payload.hasNonNull(field)) return payload.get(field).asText("").toLowerCase();
        }
        return "";
    }

    /**
     * <b>이슈</b> 삭제 이벤트 판정. 표준 웹훅은 {@code jira:issue_deleted},
     * Automation 커스텀 바디는 {@code event: "deleted"} 처럼 보내 둘 다 받는다.
     *
     * <p>단순 "delet 포함"으로 보면 {@code comment_deleted}·{@code attachment_deleted}·
     * {@code worklog_deleted}까지 이슈 삭제로 오판해 카드 연동을 끊어버린다. 그래서
     * "이슈"가 함께 명시된 경우와 커스텀 바디의 단독 {@code deleted}만 인정한다.
     */
    private boolean isIssueDeletion(String event) {
        return event.equals("deleted") || (event.contains("issue") && event.contains("delet"));
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
