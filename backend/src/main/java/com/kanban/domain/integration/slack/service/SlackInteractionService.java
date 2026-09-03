package com.kanban.domain.integration.slack.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class SlackInteractionService {

    private final ObjectMapper objectMapper;
    private final ChecklistItemRepository checklistItemRepository;
    private final SlackMentionChecklistService mentionChecklistService;

    @Transactional
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> handleInteraction(String body) {
        try {
            // Parse form-urlencoded payload
            String payloadJson = extractPayloadJson(body);
            Map<String, Object> payload = objectMapper.readValue(payloadJson, new TypeReference<>() {});

            String type = String.valueOf(payload.get("type"));

            // 태스크 검색 셀렉트의 타이핑 — 3초 안에 options를 돌려줘야 한다
            if ("block_suggestion".equals(type)) {
                return ResponseEntity.ok(mentionChecklistService.suggestTasks(
                        String.valueOf(payload.get("block_id")),
                        payload.get("value") != null ? String.valueOf(payload.get("value")) : ""));
            }

            if (!"block_actions".equals(type)) {
                return ResponseEntity.ok().build();
            }

            List<Map<String, Object>> actions = (List<Map<String, Object>>) payload.get("actions");
            if (actions == null || actions.isEmpty()) {
                return ResponseEntity.ok().build();
            }

            Map<String, Object> action = actions.get(0);
            String actionId = String.valueOf(action.get("action_id"));

            if ("bridge_mark_complete".equals(actionId)) {
                return handleMarkComplete(action, payload);
            }

            if (SlackMentionChecklistService.ACTION_TASK_SELECT.equals(actionId)
                    || SlackMentionChecklistService.ACTION_ADD_INBOX.equals(actionId)) {
                mentionChecklistService.handleBlockAction(actionId, action, payload);
                return ResponseEntity.ok().build();
            }

            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.error("Failed to handle Slack interaction: {}", e.getMessage());
            return ResponseEntity.ok().build();
        }
    }

    private ResponseEntity<Map<String, Object>> handleMarkComplete(Map<String, Object> action, Map<String, Object> payload) {
        String value = String.valueOf(action.get("value"));
        // value format: "checklist:{itemId}:{boardId}"
        String[] parts = value.split(":");
        if (parts.length < 3 || !"checklist".equals(parts[0])) {
            return ResponseEntity.ok().build();
        }

        String itemId = parts[1];

        Optional<ChecklistItem> itemOpt = checklistItemRepository.findById(itemId);
        if (itemOpt.isEmpty()) {
            return ResponseEntity.ok(Map.of(
                    "response_type", "ephemeral",
                    "text", "\uccb4\ud06c\ub9ac\uc2a4\ud2b8 \ud56d\ubaa9\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."
            ));
        }

        ChecklistItem item = itemOpt.get();
        item.toggle();

        String statusEmoji = item.getIsCompleted() ? "\u2705" : "\u2b1c";
        String statusText = item.getIsCompleted() ? "\uc644\ub8cc" : "\ubbf8\uc644\ub8cc";

        log.info("Checklist item {} toggled to {} via Slack interaction", itemId, statusText);

        return ResponseEntity.ok(Map.of(
                "response_type", "ephemeral",
                "text", statusEmoji + " " + item.getTitle() + " \u2192 " + statusText
        ));
    }

    private String extractPayloadJson(String body) {
        // Slack sends: payload=%7B%22type%22%3A%22block_actions%22...%7D
        if (body.startsWith("payload=")) {
            return URLDecoder.decode(body.substring("payload=".length()), StandardCharsets.UTF_8);
        }
        return body;
    }
}
