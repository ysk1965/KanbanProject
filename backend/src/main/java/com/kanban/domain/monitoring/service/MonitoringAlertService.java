package com.kanban.domain.monitoring.service;

import com.kanban.domain.monitoring.dto.MonitoringResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
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
    private final JavaMailSender mailSender;
    private final Environment environment;

    private static final long ALERT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
    private final ConcurrentHashMap<String, Long> lastAlertTimeMap = new ConcurrentHashMap<>();

    /**
     * Checks current metrics against thresholds and sends alerts if exceeded.
     */
    public void checkAndAlert() {
        if (!isSlackConfigured()) {
            log.debug("Monitoring alert skipped: no Slack webhook URL configured");
            return;
        }

        try {
            MonitoringResponse.Dashboard dashboard = monitoringService.getDashboard();
            MonitoringResponse.AlertConfig config = monitoringService.getAlertConfig();
            Map<String, Double> thresholds = config.thresholds();

            checkHikariMetrics(dashboard.hikari(), thresholds.getOrDefault("hikari_active_percent", 90.0));
            checkApiMetrics(dashboard.api(), thresholds.getOrDefault("error_rate_percent", 5.0));
            checkCloudWatchMetrics(dashboard.cloudWatch(),
                    thresholds.getOrDefault("cpu_percent", 80.0),
                    thresholds.getOrDefault("memory_percent", 85.0));
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

    /**
     * Sends Slack + Email alert for unexpected server errors (500).
     * Uses 10-minute cooldown per endpoint+exception to prevent alert flooding.
     * Runs async to avoid delaying the error response.
     */
    @Async
    public void sendUnexpectedErrorAlert(Exception e, String requestInfo, String userInfo) {
        // Cooldown key includes endpoint for per-endpoint tracking
        String endpoint = requestInfo.split("\\?")[0]; // strip query string for cooldown grouping
        String alertKey = "unexpected_error:" + endpoint + ":" + e.getClass().getSimpleName();
        String stackTrace = getCompactStackTrace(e);
        String rootCause = getRootCauseMessage(e);
        String env = getActiveProfile();

        String title = "예상치 못한 서버 에러 (500)";
        String slackMessage = String.format(
                "*Environment*: `%s`\n*Endpoint*: `%s`\n*User*: %s\n*Exception*: `%s`\n*Root Cause*: %s\n*Stack Trace*:\n```%s```",
                env, requestInfo, userInfo,
                e.getClass().getSimpleName(),
                truncate(rootCause, 200),
                stackTrace);

        if (sendAlertIfNotCoolingDown(alertKey, "CRITICAL", title, slackMessage)) {
            sendEmailAlert(title, env, requestInfo, userInfo,
                    e.getClass().getSimpleName(), truncate(e.getMessage(), 500),
                    rootCause, stackTrace);
        }
    }

    private String getCompactStackTrace(Exception e) {
        StringBuilder sb = new StringBuilder();
        StackTraceElement[] elements = e.getStackTrace();
        int count = 0;
        for (StackTraceElement element : elements) {
            if (count >= 5) break;
            if (element.getClassName().startsWith("com.kanban")) {
                sb.append(element.getClassName().substring(element.getClassName().lastIndexOf('.') + 1))
                        .append(".")
                        .append(element.getMethodName())
                        .append(":")
                        .append(element.getLineNumber())
                        .append("\n");
                count++;
            }
        }
        if (sb.isEmpty()) {
            sb.append(elements.length > 0 ? elements[0].toString() : "no stack trace");
        }
        return sb.toString().trim();
    }

    private String getRootCauseMessage(Throwable e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        String msg = root.getMessage();
        if (root == e || msg == null) return msg != null ? msg : "null";
        return root.getClass().getSimpleName() + ": " + msg;
    }

    private String getActiveProfile() {
        String[] profiles = environment.getActiveProfiles();
        return profiles.length > 0 ? String.join(",", profiles) : "default";
    }

    private String truncate(String text, int maxLength) {
        if (text == null) return "null";
        return text.length() > maxLength ? text.substring(0, maxLength) + "..." : text;
    }

    // ==================== Private Helpers ====================

    private boolean isSlackConfigured() {
        String url = monitoringService.getSlackWebhookUrl();
        return url != null && !url.isEmpty();
    }

    private void checkHikariMetrics(MonitoringResponse.HikariMetrics hikari, double threshold) {
        if (hikari == null) return;

        if (hikari.usagePercent() >= threshold) {
            sendAlertIfNotCoolingDown("hikari_active",
                    "WARNING",
                    "HikariCP 연결 풀 사용량 경고",
                    String.format("활성 연결 비율: %.1f%% (임계치: %.0f%%)\n활성: %d / 최대: %d",
                            hikari.usagePercent(), threshold,
                            hikari.activeConnections(), hikari.maxConnections()));
        }
    }

    private void checkApiMetrics(MonitoringResponse.ApiMetrics api, double threshold) {
        if (api == null) return;

        if (api.totalRequests() > 0 && api.errorRate() >= threshold) {
            sendAlertIfNotCoolingDown("api_error_rate",
                    "WARNING",
                    "API 에러율 경고",
                    String.format("에러율: %.2f%% (임계치: %.0f%%)\n총 요청: %d, 에러: %d",
                            api.errorRate(), threshold,
                            api.totalRequests(), api.totalErrors()));
        }
    }

    private void checkCloudWatchMetrics(MonitoringResponse.CloudWatchMetrics cloudWatch,
                                         double cpuThreshold, double memoryThreshold) {
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

    /**
     * Sends alert if not in cooldown period.
     * @return true if alert was sent (not in cooldown), false if skipped
     */
    private boolean sendAlertIfNotCoolingDown(String alertKey, String severity, String title, String message) {
        long now = System.currentTimeMillis();
        Long lastAlertTime = lastAlertTimeMap.get(alertKey);

        if (lastAlertTime != null && (now - lastAlertTime) < ALERT_COOLDOWN_MS) {
            log.debug("Alert {} is in cooldown period, skipping", alertKey);
            return false;
        }

        lastAlertTimeMap.put(alertKey, now);
        sendSlackAlert(severity, title, message);
        return true;
    }

    private void sendSlackAlert(String severity, String title, String message) {
        String webhookUrl = monitoringService.getSlackWebhookUrl();
        if (webhookUrl == null || webhookUrl.isEmpty()) {
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

            restTemplate.postForEntity(webhookUrl, entity, String.class);
            log.info("Monitoring alert sent: [{}] {}", severity, title);
        } catch (Exception e) {
            log.warn("Failed to send monitoring alert to Slack: {}", e.getMessage());
        }
    }

    private void sendEmailAlert(String title, String env, String requestInfo, String userInfo,
                                String exceptionName, String errorMessage, String rootCause, String stackTrace) {
        List<String> recipients = monitoringService.getAlertEmailRecipients();
        if (recipients == null || recipients.isEmpty()) {
            return;
        }

        String timestamp = LocalDateTime.now(ZoneOffset.UTC)
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")) + " UTC";

        String envBadgeColor = "prod".equals(env) ? "#DC2626" : "#F59E0B";
        String envLabel = env.toUpperCase();

        String subject = "[BRIDGE " + envLabel + "] " + title;
        String htmlBody = String.format("""
                <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background: %s; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
                    <h2 style="margin: 0; font-size: 18px;">BRIDGE 서버 에러 알림
                      <span style="font-size: 12px; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 4px; margin-left: 8px;">%s</span>
                    </h2>
                  </div>
                  <div style="border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
                    <table style="width: 100%%; border-collapse: collapse; font-size: 14px;">
                      <tr>
                        <td style="padding: 8px 0; color: #6B7280; width: 120px;">Endpoint</td>
                        <td style="padding: 8px 0; font-weight: 600; font-family: monospace;">%s</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6B7280;">User</td>
                        <td style="padding: 8px 0;">%s</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6B7280;">Exception</td>
                        <td style="padding: 8px 0; font-weight: 600;">%s</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6B7280;">Message</td>
                        <td style="padding: 8px 0;">%s</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6B7280;">Root Cause</td>
                        <td style="padding: 8px 0; color: #DC2626; font-family: monospace; font-size: 13px;">%s</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6B7280;">Time (UTC)</td>
                        <td style="padding: 8px 0;">%s</td>
                      </tr>
                    </table>
                    <div style="margin-top: 16px;">
                      <p style="color: #6B7280; font-size: 13px; margin-bottom: 8px;">Stack Trace:</p>
                      <pre style="background: #1F2937; color: #F9FAFB; padding: 16px; border-radius: 6px; font-size: 12px; overflow-x: auto;">%s</pre>
                    </div>
                  </div>
                </div>
                """, envBadgeColor, envLabel, requestInfo, userInfo,
                exceptionName, errorMessage, truncate(rootCause, 300), timestamp, stackTrace);

        for (String recipient : recipients) {
            try {
                var message = mailSender.createMimeMessage();
                var helper = new MimeMessageHelper(message, true, "UTF-8");
                helper.setTo(recipient.trim());
                helper.setSubject(subject);
                helper.setText(htmlBody, true);
                mailSender.send(message);
                log.info("Error alert email sent to: {}", recipient);
            } catch (Exception e) {
                log.warn("Failed to send error alert email to {}: {}", recipient, e.getMessage());
            }
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
