package com.kanban.domain.integration.slack.controller;

import com.kanban.domain.integration.slack.dto.SlackWebhookRequest;
import com.kanban.domain.integration.slack.dto.SlackWebhookResponse;
import com.kanban.domain.integration.slack.service.SlackWebhookService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/slack-webhook")
@RequiredArgsConstructor
public class SlackWebhookController {

    private final SlackWebhookService slackWebhookService;

    @GetMapping("/statuses")
    public ResponseEntity<List<SlackWebhookResponse.MemberStatus>> getWebhookStatuses(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<SlackWebhookResponse.MemberStatus> statuses = slackWebhookService.getWebhookStatuses(
                boardId, principal.getUserId());
        return ResponseEntity.ok(statuses);
    }

    @GetMapping("/me")
    public ResponseEntity<SlackWebhookResponse.Detail> getMyWebhook(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        SlackWebhookResponse.Detail response = slackWebhookService.getMyWebhook(boardId, principal.getUserId());
        if (response == null) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok(response);
    }

    @PutMapping("/me")
    public ResponseEntity<SlackWebhookResponse.Detail> upsertMyWebhook(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody SlackWebhookRequest.Upsert request) {
        SlackWebhookResponse.Detail response = slackWebhookService.upsertMyWebhook(
                boardId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/me")
    public ResponseEntity<Map<String, String>> deleteMyWebhook(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        slackWebhookService.deleteMyWebhook(boardId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "Slack 웹훅이 삭제되었습니다"));
    }

    @PostMapping("/me/test")
    public ResponseEntity<SlackWebhookResponse.TestResult> testMyWebhook(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String brandName,
            @RequestHeader(value = "Origin", required = false) String origin) {
        SlackWebhookResponse.TestResult result = slackWebhookService.testMyWebhook(
                boardId, principal.getUserId(), brandName, origin);
        return ResponseEntity.ok(result);
    }
}
