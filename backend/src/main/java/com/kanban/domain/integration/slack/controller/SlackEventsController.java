package com.kanban.domain.integration.slack.controller;

import com.kanban.domain.integration.slack.service.SlackEventService;
import com.kanban.domain.integration.slack.service.SlackInteractionService;
import com.kanban.domain.integration.slack.service.SlackSignatureVerifier;
import com.kanban.domain.integration.slack.service.SlackSlashCommandService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/v1/slack")
@RequiredArgsConstructor
public class SlackEventsController {

    private final SlackSignatureVerifier signatureVerifier;
    private final SlackEventService eventService;
    private final SlackSlashCommandService slashCommandService;
    private final SlackInteractionService interactionService;

    /**
     * Events API endpoint
     */
    @PostMapping("/events")
    public ResponseEntity<Object> handleEvent(
            @RequestHeader("X-Slack-Request-Timestamp") String timestamp,
            @RequestHeader("X-Slack-Signature") String signature,
            @RequestBody String body) {

        verifySignature(timestamp, body, signature);

        return eventService.handleEvent(body);
    }

    /**
     * Slash commands endpoint
     */
    @PostMapping(value = "/commands", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Map<String, Object>> handleCommand(
            @RequestHeader("X-Slack-Request-Timestamp") String timestamp,
            @RequestHeader("X-Slack-Signature") String signature,
            @RequestBody String body,
            @RequestParam("command") String command,
            @RequestParam("text") String text,
            @RequestParam("team_id") String teamId,
            @RequestParam("channel_id") String channelId,
            @RequestParam("user_id") String slackUserId,
            @RequestParam("user_name") String userName) {

        verifySignature(timestamp, body, signature);

        return ResponseEntity.ok(slashCommandService.handleCommand(command, text, teamId, channelId, slackUserId, userName));
    }

    /**
     * Interactive components endpoint
     */
    @PostMapping(value = "/interactions", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Map<String, Object>> handleInteraction(
            @RequestHeader("X-Slack-Request-Timestamp") String timestamp,
            @RequestHeader("X-Slack-Signature") String signature,
            @RequestBody String body) {

        verifySignature(timestamp, body, signature);

        return interactionService.handleInteraction(body);
    }

    private void verifySignature(String timestamp, String body, String signature) {
        if (!signatureVerifier.verify(timestamp, body, signature)) {
            throw new BusinessException(ErrorCode.SLACK_SIGNATURE_INVALID);
        }
    }
}
