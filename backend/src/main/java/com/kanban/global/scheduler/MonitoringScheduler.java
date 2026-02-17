package com.kanban.global.scheduler;

import com.kanban.domain.monitoring.service.MonitoringAlertService;
import com.kanban.domain.monitoring.service.MonitoringService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class MonitoringScheduler {

    private final MonitoringService monitoringService;
    private final MonitoringAlertService monitoringAlertService;

    @Value("${app.monitoring.enabled:true}")
    private boolean monitoringEnabled;

    /**
     * Periodically flushes in-memory API metrics to the database.
     */
    @Scheduled(fixedRateString = "${app.monitoring.metric-flush-interval:3600000}")
    public void flushMetrics() {
        if (!monitoringEnabled) {
            return;
        }

        try {
            monitoringService.flushMetricsToDb();
        } catch (Exception e) {
            log.error("Failed to flush API metrics to DB: {}", e.getMessage(), e);
        }
    }

    /**
     * Periodically checks metrics against thresholds and sends alerts.
     */
    @Scheduled(fixedRateString = "${app.monitoring.alert-check-interval:300000}")
    public void checkAlerts() {
        if (!monitoringEnabled) {
            return;
        }

        try {
            monitoringAlertService.checkAndAlert();
        } catch (Exception e) {
            log.error("Failed to check monitoring alerts: {}", e.getMessage(), e);
        }
    }

    /**
     * Cleans up old metric snapshots daily at 3 AM UTC.
     */
    @Scheduled(cron = "0 0 3 * * *")
    public void cleanupOldData() {
        if (!monitoringEnabled) {
            return;
        }

        try {
            monitoringService.cleanupOldData();
        } catch (Exception e) {
            log.error("Failed to cleanup old monitoring data: {}", e.getMessage(), e);
        }
    }

}
