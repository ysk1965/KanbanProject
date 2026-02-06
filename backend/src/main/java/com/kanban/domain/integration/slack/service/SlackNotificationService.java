package com.kanban.domain.integration.slack.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.integration.slack.MemberSlackWebhook;
import com.kanban.domain.integration.slack.MemberSlackWebhookRepository;
import com.kanban.domain.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class SlackNotificationService {

    private final MemberSlackWebhookRepository webhookRepository;
    private final RestTemplate restTemplate;

    @Value("${app.frontend-url:https://bridgespots.com}")
    private String frontendUrl;

    @Async
    public void sendMentionNotifications(Comment comment, User sender, Board board) {
        if (comment.getMentions() == null || comment.getMentions().isEmpty()) {
            return;
        }

        List<String> mentionedUserIds = Arrays.stream(comment.getMentions().split(","))
                .map(String::trim)
                .filter(id -> !id.equals(sender.getId()))
                .toList();

        if (mentionedUserIds.isEmpty()) {
            return;
        }

        List<MemberSlackWebhook> webhooks = webhookRepository
                .findByBoardIdAndUserIdInAndEnabledTrue(board.getId(), mentionedUserIds);

        if (webhooks.isEmpty()) {
            return;
        }

        Map<String, Object> payload = buildMentionPayload(comment, sender, board);

        for (MemberSlackWebhook webhook : webhooks) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);

                restTemplate.postForEntity(webhook.getWebhookUrl(), entity, String.class);
                log.info("Slack mention notification sent to user {} on board {}",
                        webhook.getUser().getId(), board.getId());
            } catch (Exception e) {
                log.warn("Failed to send Slack notification to user {} on board {}: {}",
                        webhook.getUser().getId(), board.getId(), e.getMessage());
            }
        }
    }

    private Map<String, Object> buildMentionPayload(Comment comment, User sender, Board board) {
        String taskTitle = comment.getTask() != null ? comment.getTask().getTitle() : "Unknown Task";
        String commentContent = comment.getContent();
        if (commentContent != null && commentContent.length() > 200) {
            commentContent = commentContent.substring(0, 200) + "...";
        }

        String boardUrl = frontendUrl + "/boards/" + board.getId();

        List<Map<String, Object>> blocks = new ArrayList<>();

        // Header
        blocks.add(Map.of("type", "header",
                "text", Map.of("type", "plain_text", "text", "\uD83D\uDCAC BRIDGE - @멘션 알림", "emoji", true)));

        // Info fields
        blocks.add(Map.of("type", "section",
                "fields", List.of(
                        Map.of("type", "mrkdwn", "text", "*Board:*\n" + board.getName()),
                        Map.of("type", "mrkdwn", "text", "*Task:*\n" + taskTitle),
                        Map.of("type", "mrkdwn", "text", "*Author:*\n" + sender.getName())
                )));

        // Comment content
        if (commentContent != null && !commentContent.isBlank()) {
            blocks.add(Map.of("type", "section",
                    "text", Map.of("type", "mrkdwn", "text", "> " + commentContent)));
        }

        // Action button
        blocks.add(Map.of("type", "actions",
                "elements", List.of(
                        Map.of("type", "button",
                                "text", Map.of("type", "plain_text", "text", "BRIDGE에서 보기"),
                                "url", boardUrl)
                )));

        // Footer
        blocks.add(Map.of("type", "context",
                "elements", List.of(
                        Map.of("type", "mrkdwn", "text", "Sent from BRIDGE Kanban Board")
                )));

        return Map.of("blocks", blocks);
    }
}
