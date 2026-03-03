package com.kanban.domain.subscription.controller;

import com.kanban.domain.subscription.service.PolarWebhookService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Controller for receiving Polar.sh webhook events.
 *
 * <p>This endpoint is publicly accessible (configured in SecurityConfig)
 * and verifies webhook authenticity via HMAC-SHA256 signature validation.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/webhooks/polar")
@RequiredArgsConstructor
public class PolarWebhookController {

    private final PolarWebhookService polarWebhookService;

    @PostMapping
    public ResponseEntity<Void> handleWebhook(
            @RequestHeader("webhook-id") String webhookId,
            @RequestHeader("webhook-signature") String signature,
            @RequestHeader("webhook-timestamp") String timestamp,
            @RequestBody String payload) {

        log.info("Received Polar webhook: webhookId={}", webhookId);

        polarWebhookService.handleWebhook(webhookId, signature, timestamp, payload);

        return ResponseEntity.ok().build();
    }
}
