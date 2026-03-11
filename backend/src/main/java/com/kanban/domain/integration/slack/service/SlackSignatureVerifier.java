package com.kanban.domain.integration.slack.service;

import com.kanban.domain.integration.slack.config.SlackAppConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

@Slf4j
@Component
@RequiredArgsConstructor
public class SlackSignatureVerifier {

    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final long MAX_TIMESTAMP_DIFF_SECONDS = 300; // 5 minutes

    private final SlackAppConfig slackAppConfig;

    public boolean verify(String timestamp, String body, String signature) {
        if (timestamp == null || body == null || signature == null) {
            return false;
        }

        // Check timestamp freshness (replay protection)
        try {
            long requestTimestamp = Long.parseLong(timestamp);
            long currentTimestamp = Instant.now().getEpochSecond();
            if (Math.abs(currentTimestamp - requestTimestamp) > MAX_TIMESTAMP_DIFF_SECONDS) {
                log.warn("Slack request timestamp too old: {} (current: {})", requestTimestamp, currentTimestamp);
                return false;
            }
        } catch (NumberFormatException e) {
            return false;
        }

        // Compute HMAC
        String sigBasestring = "v0:" + timestamp + ":" + body;
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(slackAppConfig.getSigningSecret().getBytes(StandardCharsets.UTF_8), HMAC_SHA256));
            byte[] hash = mac.doFinal(sigBasestring.getBytes(StandardCharsets.UTF_8));
            String computed = "v0=" + bytesToHex(hash);

            // Constant-time comparison
            return MessageDigest.isEqual(computed.getBytes(StandardCharsets.UTF_8), signature.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            log.error("Failed to verify Slack signature", e);
            return false;
        }
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
