package com.kanban.domain.monitoring.service;

import com.kanban.domain.monitoring.dto.MonitoringResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class MonitoringAlertService {

    private final RestTemplate restTemplate;
    private final MonitoringService monitoringService;

    @Value("${app.monitoring.slack-webhook-url:}")
    private String slackWebhookUrl;

    @Value("${app.monitoring.thresholds.cpu-percent:80}")
    private double cpuThreshold;

    @Value("${app.monitoring.thresholds.memory-percent:85}")
    private double memoryThreshold;

    @Value("${app.monitoring.thresholds.hikari-active-percent:90}")
    private double hikariActiveThreshold;

    @Value("${app.monitoring.thresholds.error-rate-percent:5}")
    private double errorRateThreshold;

    private static final long ALERT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
    private final ConcurrentHashMap<String, Long> lastAlertTimeMap = new ConcurrentHashMap<>();

    /**
     * Checks current metrics against thresholds and sends alerts if exceeded.
     */
    public void checkAndAlert() {
        if (slackWebhookUrl == null || slackWebhookUrl.isEmpty()) {
            log.debug("Monitoring alert skipped: no Slack webhook URL configured");
            return;
        }

        try {
            MonitoringResponse.Dashboard dashboard = monitoringService.getDashboard();
            checkHikariMetrics(dashboard.hikari());
            checkApiMetrics(dashboard.api());
            checkCloudWatchMetrics(dashboard.cloudWatch());
        } catch (Exception e) {
            log.warn("Failed to check monitoring alerts: {}", e.getMessage());
        }
    }

    /**
     * Sends a test alert to verify Slack webhook configuration.
     */
    public void sendTestAlert() {
        sendSlackAlert("INFO",
                "테스트 알림",
                "BRIDGE 모니터링 시스템의 Slack 연동이 정상적으로 작동합니다.");
    }

    // ==================== Private Helpers ====================

    private void checkHikariMetrics(MonitoringResponse.HikariMetrics hikari) {
        if (hikari == null) return;

        if (hikari.usagePercent() >= hikariActiveThreshold) {
            sendAlertIfNotCoolingDown("hikari_active",
                    "WARNING",
                    "HikariCP 연결 풀 사용량 경고",
                    String.format("활성 연결 비율: %.1f%% (임계치: %.0f%%)\n활성: %d / 최대: %d",
                            hikari.usagePercent(), hikariActiveThreshold,
                            hikari.activeConnections(), hikari.maxConnections()));
        }
    }

    private void checkApiMetrics(MonitoringResponse.ApiMetrics api) {
        if (api == null) return;

        if (api.totalRequests() > 0 && api.errorRate() >= errorRateThreshold) {
            sendAlertIfNotCoolingDown("api_error_rate",
                    "WARNING",
                    "API 에러율 경고",
                    String.format("에러율: %.2f%% (임계치: %.0f%%)\n총 요청: %d, 에러: %d",
                            api.errorRate(), errorRateThreshold,
                            api.totalRequests(), api.totalErrors()));
        }
    }

    private void checkCloudWatchMetrics(MonitoringResponse.CloudWatchMetrics cloudWatch) {
        if (cloudWatch == null) return;

        if (cloudWatch.ec2() != null && cloudWatch.ec2().cpuUtilization() >= cpuThreshold) {
            sendAlertIfNotCoolingDown("ec2_cpu",
                    "WARNING",
                    "EC2 CPU 사용량 경고",
                    String.format("CPU 사용률: %.1f%% (임계치: %.0f%%)",
                            cloudWatch.ec2().cpuUtilization(), cpuThreshold));
        }

        if (cloudWatch.rds() != null && cloudWatch.rds().cpuUtilization() >= memoryThreshold) {
            sendAlertIfNotCoolingDown("rds_cpu",
                    "WARNING",
                    "RDS CPU 사용량 경고",
                    String.format("RDS CPU 사용률: %.1f%% (임계치: %.0f%%)",
                            cloudWatch.rds().cpuUtilization(), memoryThreshold));
        }
    }

    private void sendAlertIfNotCoolingDown(String alertKey, String severity, String title, String message) {
        long now = System.currentTimeMillis();
        Long lastAlertTime = lastAlertTimeMap.get(alertKey);

        if (lastAlertTime != null && (now - lastAlertTime) < ALERT_COOLDOWN_MS) {
            log.debug("Alert {} is in cooldown period, skipping", alertKey);
            return;
        }

        lastAlertTimeMap.put(alertKey, now);
        sendSlackAlert(severity, title, message);
    }

    private void sendSlackAlert(String severity, String title, String message) {
        if (slackWebhookUrl == null || slackWebhookUrl.isEmpty()) {
            log.warn("Cannot send monitoring alert: no Slack webhook URL configured");
            return;
        }

        try {
            String timestamp = LocalDateTime.now(ZoneOffset.UTC)
                    .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")) + " UTC";

            String emoji = switch (severity) {
                case "CRITICAL" -> "\uD83D\uDD34";
                case "WARNING" -> "\uD83D\uDFE1";
                default -> "\uD83D\uDFE2";
            };

            Map<String, Object> payload = buildSlackPayload(emoji, severity, title, message, timestamp);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);

            restTemplate.postForEntity(slackWebhookUrl, entity, String.class);
            log.info("Monitoring alert sent: [{}] {}", severity, title);
        } catch (Exception e) {
            log.warn("Failed to send monitoring alert to Slack: {}", e.getMessage());
        }
    }

    private Map<String, Object> buildSlackPayload(String emoji, String severity,
                                                    String title, String message, String timestamp) {
        List<Map<String, Object>> blocks = new ArrayList<>();

        // Header
        blocks.add(Map.of("type", "header",
                "text", Map.of("type", "plain_text",
                        "text", emoji + " BRIDGE 모니터링 알림",
                        "emoji", true)));

        // Section with title and message
        blocks.add(Map.of("type", "section",
                "text", Map.of("type", "mrkdwn",
                        "text", "*" + title + "*\n" + message)));

        // Context with timestamp
        blocks.add(Map.of("type", "context",
                "elements", List.of(
                        Map.of("type", "mrkdwn",
                                "text", "발생 시각: " + timestamp))));

        return Map.of("blocks", blocks);
    }
}
