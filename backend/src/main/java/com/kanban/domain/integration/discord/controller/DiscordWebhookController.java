package com.kanban.domain.integration.discord.controller;

import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.integration.discord.dto.DiscordWebhookRequest;
import com.kanban.domain.integration.discord.dto.DiscordWebhookResponse;
import com.kanban.domain.integration.discord.service.DiscordWebhookService;
import com.kanban.global.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/boards/{boardId}/discord-webhook")
@RequiredArgsConstructor
public class DiscordWebhookController {

    private final BoardService boardService;
    private final DiscordWebhookService discordWebhookService;

    @GetMapping("/statuses")
    public ResponseEntity<List<DiscordWebhookResponse.MemberStatus>> getWebhookStatuses(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<DiscordWebhookResponse.MemberStatus> statuses = discordWebhookService.getWebhookStatuses(
                boardId, principal.getUserId());
        return ResponseEntity.ok(statuses);
    }

    @GetMapping("/me")
    public ResponseEntity<DiscordWebhookResponse.Detail> getMyWebhook(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        DiscordWebhookResponse.Detail response = discordWebhookService.getMyWebhook(boardId, principal.getUserId());
        if (response == null) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok(response);
    }

    @PutMapping("/me")
    public ResponseEntity<DiscordWebhookResponse.Detail> upsertMyWebhook(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody DiscordWebhookRequest.Upsert request) {
        boardService.checkTeamBoardOnly(boardId);
        DiscordWebhookResponse.Detail response = discordWebhookService.upsertMyWebhook(
                boardId, principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/me")
    public ResponseEntity<Map<String, String>> deleteMyWebhook(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal) {
        boardService.checkTeamBoardOnly(boardId);
        discordWebhookService.deleteMyWebhook(boardId, principal.getUserId());
        return ResponseEntity.ok(Map.of("message", "Discord 웹훅이 삭제되었습니다"));
    }

    @PostMapping("/me/test")
    public ResponseEntity<DiscordWebhookResponse.TestResult> testMyWebhook(
            @PathVariable String boardId,
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String brandName,
            @RequestHeader(value = "Origin", required = false) String origin) {
        DiscordWebhookResponse.TestResult result = discordWebhookService.testMyWebhook(
                boardId, principal.getUserId(), brandName, origin);
        return ResponseEntity.ok(result);
    }
}
