package com.kanban.domain.integration.slack.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.integration.slack.SlackEventLog;
import com.kanban.domain.integration.slack.SlackEventLogRepository;
import com.kanban.domain.integration.slack.SlackInstallationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class SlackEventService {

    private final SlackEventLogRepository eventLogRepository;
    private final SlackInstallationRepository installationRepository;
    private final ObjectMapper objectMapper;

    /**
     * Handle incoming Slack event
     */
    public ResponseEntity<Object> handleEvent(String body) {
        try {
            Map<String, Object> payload = objectMapper.readValue(body, new TypeReference<>() {});
            String type = String.valueOf(payload.get("type"));

            // URL verification challenge
            if ("url_verification".equals(type)) {
                return ResponseEntity.ok(Map.of("challenge", payload.get("challenge")));
            }

            // Event callback
            if ("event_callback".equals(type)) {
                String eventId = String.valueOf(payload.get("event_id"));

                // Dedup check
                if (eventLogRepository.existsByEventId(eventId)) {
                    return ResponseEntity.ok().build();
                }

                // Log event
                SlackEventLog eventLog = SlackEventLog.builder()
                        .eventId(eventId)
                        .eventType(type)
                        .processedAt(LocalDateTime.now(ZoneOffset.UTC))
                        .build();
                eventLogRepository.save(eventLog);

                // Process asynchronously
                processEventAsync(payload);
            }

            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.error("Failed to handle Slack event: {}", e.getMessage());
            return ResponseEntity.ok().build(); // Always return 200 to Slack
        }
    }

    @Async
    @Transactional
    public void processEventAsync(Map<String, Object> payload) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> event = (Map<String, Object>) payload.get("event");
            if (event == null) return;

            String eventType = String.valueOf(event.get("type"));

            switch (eventType) {
                case "app_uninstalled" -> handleAppUninstalled(payload);
                case "tokens_revoked" -> handleTokensRevoked(payload);
                case "reaction_added" -> handleReactionAdded(event, payload);
                default -> log.debug("Unhandled Slack event type: {}", eventType);
            }
        } catch (Exception e) {
            log.error("Failed to process Slack event async: {}", e.getMessage());
        }
    }

    private void handleAppUninstalled(Map<String, Object> payload) {
        String teamId = String.valueOf(payload.get("team_id"));
        installationRepository.findActiveByTeamId(teamId)
                .forEach(installation -> {
                    installation.deactivate();
                    log.info("Slack App uninstalled for team {}, deactivated installation {}", teamId, installation.getId());
                });
    }

    private void handleTokensRevoked(Map<String, Object> payload) {
        String teamId = String.valueOf(payload.get("team_id"));
        installationRepository.findActiveByTeamId(teamId)
                .forEach(installation -> {
                    installation.deactivate();
                    log.info("Slack tokens revoked for team {}, deactivated installation {}", teamId, installation.getId());
                });
    }

    private void handleReactionAdded(Map<String, Object> event, Map<String, Object> payload) {
        String reaction = String.valueOf(event.get("reaction"));

        // Only handle white_check_mark for completing items
        if (!"white_check_mark".equals(reaction)) {
            return;
        }

        // Extract message metadata to find BRIDGE entity
        @SuppressWarnings("unchecked")
        Map<String, Object> item = (Map<String, Object>) event.get("item");
        if (item == null) return;

        String messageTs = String.valueOf(item.get("ts"));
        String channel = String.valueOf(item.get("channel"));

        log.info("Reaction {} added to message {} in channel {} - will process in future phase",
                reaction, messageTs, channel);
        // TODO: Phase 2+ - Fetch message metadata, resolve entity, toggle completion
    }

    /**
     * Clean up old event logs (called by scheduler)
     */
    @Transactional
    public void cleanupOldEventLogs() {
        LocalDateTime cutoff = LocalDateTime.now(ZoneOffset.UTC).minusHours(24);
        eventLogRepository.deleteOlderThan(cutoff);
    }
}
