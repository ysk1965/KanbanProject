package com.kanban.domain.integration.jira.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.integration.jira.JiraIntegrationConfig;
import com.kanban.domain.integration.jira.JiraIntegrationConfigRepository;
import com.kanban.domain.user.User;
import com.kanban.global.websocket.WebSocketEventService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 웹훅 이벤트 분기 검증.
 *
 * <p>핵심은 첫 번째 테스트다 — 코멘트 삭제 이벤트({@code comment_deleted})가 이슈 삭제로 오분기되면
 * 코멘트 하나 지웠을 뿐인데 카드 전체의 JIRA 연동이 끊긴다(soft-unlink). 같은 함정이
 * {@code attachment_deleted}·{@code worklog_deleted}에도 있어 함께 막는다.
 */
@ExtendWith(MockitoExtension.class)
class JiraWebhookRoutingTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock JiraIntegrationConfigRepository configRepository;
    @Mock JiraImportService importService;
    @Mock JiraCommentSyncService commentSyncService;
    @Mock WebSocketEventService webSocketEventService;

    @InjectMocks JiraWebhookService service;

    private JsonNode payload(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void 코멘트_삭제는_이슈_연동해제로_번지지_않는다() {
        service.process("board-1", payload("""
            {"webhookEvent":"comment_deleted","issue":{"key":"QASA-1"},"comment":{"id":"10101"}}
            """));

        verify(commentSyncService).applyRemoteDelete("board-1", "10101");
        verify(importService, never()).markIssueDeleted(anyString(), anyString());
        verify(importService, never()).syncSingleIssue(anyString(), anyString(), anyString());
    }

    @Test
    void 첨부_삭제도_이슈_연동해제로_번지지_않는다() {
        service.process("board-1", payload("""
            {"webhookEvent":"attachment_deleted","issue":{"key":"QASA-1"}}
            """));

        verify(importService, never()).markIssueDeleted(anyString(), anyString());
    }

    @Test
    void 코멘트_생성은_댓글_동기화로_간다() {
        service.process("board-1", payload("""
            {"webhookEvent":"comment_created","issue":{"key":"QASA-1"},
             "comment":{"id":"10102","body":{"type":"doc","content":[]}}}
            """));

        verify(commentSyncService).applyRemoteCreate(eq("board-1"), eq("QASA-1"), any(JsonNode.class));
        verify(importService, never()).syncSingleIssue(anyString(), anyString(), anyString());
    }

    @Test
    void 이슈_삭제는_연동_해제로_간다() {
        when(importService.markIssueDeleted("board-1", "QASA-1")).thenReturn("task-1");

        service.process("board-1", payload("""
            {"webhookEvent":"jira:issue_deleted","issue":{"key":"QASA-1"}}
            """));

        verify(importService).markIssueDeleted("board-1", "QASA-1");
        verify(webSocketEventService).sendBoardEvent(eq("board-1"), any(), eq("jira-sync"), eq("JIRA"), any());
    }

    @Test
    void 일반_이슈_변경은_단건_pull로_간다() {
        User connectedBy = mock(User.class);
        when(connectedBy.getId()).thenReturn("user-1");
        JiraIntegrationConfig config = mock(JiraIntegrationConfig.class);
        when(config.getConnectedBy()).thenReturn(connectedBy);
        when(configRepository.findActiveByBoardId("board-1")).thenReturn(Optional.of(config));

        service.process("board-1", payload("""
            {"webhookEvent":"jira:issue_updated","issue":{"key":"QASA-1"}}
            """));

        verify(importService).syncSingleIssue("board-1", "user-1", "QASA-1");
        verify(importService, never()).markIssueDeleted(anyString(), anyString());
    }
}
