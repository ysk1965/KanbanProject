package com.kanban.domain.monitoring.controller;

import com.kanban.domain.monitoring.dto.MonitoringResponse;
import com.kanban.domain.monitoring.service.MonitoringAlertService;
import com.kanban.domain.monitoring.service.MonitoringService;
import com.kanban.domain.monitoring.service.OpenAIBillingService;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@PreAuthorize("hasRole('ADMIN')")
@RequestMapping("/api/v1/admin/monitoring")
@RequiredArgsConstructor
public class MonitoringController {

    private final MonitoringService monitoringService;
    private final MonitoringAlertService monitoringAlertService;
    private final OpenAIBillingService openAIBillingService;

    /**
     * GET /api/v1/admin/monitoring/dashboard
     * Returns the unified monitoring dashboard with JVM, HikariCP, API, and CloudWatch metrics.
     */
    @GetMapping("/dashboard")
    public ResponseEntity<MonitoringResponse.Dashboard> getDashboard() {
        return ResponseEntity.ok(monitoringService.getDashboard());
    }

    /**
     * GET /api/v1/admin/monitoring/api-metrics/history?hours=24
     * Returns API metric history from stored snapshots.
     */
    @GetMapping("/api-metrics/history")
    public ResponseEntity<MonitoringResponse.ApiMetricHistory> getApiMetricHistory(
            @RequestParam(defaultValue = "24") int hours) {
        return ResponseEntity.ok(monitoringService.getApiMetricHistory(hours));
    }

    /**
     * GET /api/v1/admin/monitoring/cloudwatch
     * Returns CloudWatch metrics for EC2 and RDS.
     */
    @GetMapping("/cloudwatch")
    public ResponseEntity<MonitoringResponse.CloudWatchMetrics> getCloudWatchMetrics() {
        return ResponseEntity.ok(monitoringService.getCloudWatchMetrics());
    }

    /**
     * GET /api/v1/admin/monitoring/alert-config
     * Returns the current alert configuration.
     */
    @GetMapping("/alert-config")
    public ResponseEntity<MonitoringResponse.AlertConfig> getAlertConfig() {
        return ResponseEntity.ok(monitoringService.getAlertConfig());
    }

    /**
     * PUT /api/v1/admin/monitoring/alert-config
     * Updates the alert configuration.
     */
    @PutMapping("/alert-config")
    public ResponseEntity<MonitoringResponse.AlertConfig> updateAlertConfig(@RequestBody Map<String, Object> request) {
        String webhookUrl = (String) request.get("slack_webhook_url");
        boolean enabled = Boolean.TRUE.equals(request.get("enabled"));
        @SuppressWarnings("unchecked")
        List<String> emailRecipients = (List<String>) request.get("alert_email_recipients");
        return ResponseEntity.ok(monitoringService.updateAlertConfig(webhookUrl, enabled, emailRecipients));
    }

    /**
     * POST /api/v1/admin/monitoring/alert-test
     * Sends a test alert to the configured Slack webhook.
     */
    @PostMapping("/alert-test")
    public ResponseEntity<Map<String, String>> sendTestAlert() {
        monitoringAlertService.sendTestAlert();
        return ResponseEntity.ok(Map.of("message", "테스트 알림이 발송되었습니다"));
    }

    /**
     * GET /api/v1/admin/monitoring/ai-usage?days=30
     * Returns AI API usage metrics for the given period.
     */
    @GetMapping("/ai-usage")
    public ResponseEntity<MonitoringResponse.AiUsageMetrics> getAiUsageMetrics(
            @RequestParam(defaultValue = "30") int days) {
        return ResponseEntity.ok(monitoringService.getAiUsageMetrics(days));
    }

    /**
     * GET /api/v1/admin/monitoring/openai-billing?days=30
     * Returns OpenAI account billing data (daily costs + model usage).
     */
    @GetMapping("/openai-billing")
    public ResponseEntity<MonitoringResponse.OpenAIBilling> getOpenAIBilling(
            @RequestParam(defaultValue = "30") int days) {
        return ResponseEntity.ok(openAIBillingService.getBilling(days));
    }
}
