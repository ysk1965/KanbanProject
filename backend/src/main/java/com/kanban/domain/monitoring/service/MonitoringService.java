package com.kanban.domain.monitoring.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.monitoring.dto.MonitoringResponse;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.entity.ApiMetricSnapshot;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.monitoring.repository.ApiMetricSnapshotRepository;
import com.kanban.global.interceptor.ApiMetricsInterceptor;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import software.amazon.awssdk.services.cloudwatch.CloudWatchClient;
import software.amazon.awssdk.services.cloudwatch.model.*;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MonitoringService {

    private final ApiMetricsInterceptor apiMetricsInterceptor;
    private final MeterRegistry meterRegistry;
    private final ApiMetricSnapshotRepository snapshotRepository;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final BoardRepository boardRepository;
    private final Optional<CloudWatchClient> cloudWatchClient;

    @Value("${app.monitoring.data-retention-days:7}")
    private int dataRetentionDays;

    @Value("${app.monitoring.slack-webhook-url:}")
    private String slackWebhookUrl;

    @Value("${app.monitoring.enabled:true}")
    private boolean monitoringEnabled;

    @Value("${app.monitoring.thresholds.cpu-percent:80}")
    private double cpuThreshold;

    @Value("${app.monitoring.thresholds.memory-percent:85}")
    private double memoryThreshold;

    @Value("${app.monitoring.thresholds.hikari-active-percent:90}")
    private double hikariActiveThreshold;

    @Value("${app.monitoring.thresholds.error-rate-percent:5}")
    private double errorRateThreshold;

    @Value("${app.monitoring.thresholds.slow-api-ms:3000}")
    private double slowApiThreshold;

    @Value("${app.monitoring.ec2-instance-id:#{null}}")
    private String ec2InstanceId;

    @Value("${app.monitoring.rds-instance-id:#{null}}")
    private String rdsInstanceId;

    /**
     * Returns a unified dashboard with JVM, HikariCP, API, and CloudWatch metrics.
     */
    public MonitoringResponse.Dashboard getDashboard() {
        MonitoringResponse.JvmMetrics jvm = collectJvmMetrics();
        MonitoringResponse.HikariMetrics hikari = collectHikariMetrics();
        MonitoringResponse.ApiMetrics api = collectApiMetrics();
        MonitoringResponse.CloudWatchMetrics cloudWatch = collectCloudWatchMetrics();

        return new MonitoringResponse.Dashboard(
                jvm,
                hikari,
                api,
                cloudWatch,
                LocalDateTime.now(ZoneOffset.UTC).toString()
        );
    }

    /**
     * Returns API metric history from DB snapshots for the given hours window.
     */
    public MonitoringResponse.ApiMetricHistory getApiMetricHistory(int hours) {
        LocalDateTime end = LocalDateTime.now(ZoneOffset.UTC);
        LocalDateTime start = end.minusHours(hours);

        List<ApiMetricSnapshot> snapshots = snapshotRepository
                .findBySnapshotTimeBetweenOrderBySnapshotTimeAsc(start, end);

        List<MonitoringResponse.ApiMetricSnapshotDto> dtos = snapshots.stream()
                .map(s -> new MonitoringResponse.ApiMetricSnapshotDto(
                        s.getEndpoint(),
                        s.getHttpMethod(),
                        s.getSnapshotTime().toString(),
                        s.getRequestCount(),
                        s.getAvgResponseMs(),
                        s.getMaxResponseMs(),
                        s.getP95ResponseMs(),
                        s.getP99ResponseMs(),
                        s.getErrorCount(),
                        s.getErrorRate()
                ))
                .collect(Collectors.toList());

        return new MonitoringResponse.ApiMetricHistory(dtos);
    }

    /**
     * Returns CloudWatch metrics for EC2 and RDS.
     */
    public MonitoringResponse.CloudWatchMetrics getCloudWatchMetrics() {
        return collectCloudWatchMetrics();
    }

    /**
     * Flushes in-memory API metrics to the database as snapshots.
     */
    @Transactional
    public void flushMetricsToDb() {
        Map<String, ApiMetricsInterceptor.EndpointStats> metrics = apiMetricsInterceptor.getAndResetMetrics();
        if (metrics.isEmpty()) {
            log.debug("No API metrics to flush");
            return;
        }

        LocalDateTime snapshotTime = LocalDateTime.now(ZoneOffset.UTC);
        List<ApiMetricSnapshot> snapshots = new ArrayList<>();

        for (Map.Entry<String, ApiMetricsInterceptor.EndpointStats> entry : metrics.entrySet()) {
            String key = entry.getKey();
            ApiMetricsInterceptor.EndpointStats stats = entry.getValue();

            // Parse "METHOD /path" format
            String[] parts = key.split(" ", 2);
            String method = parts.length > 0 ? parts[0] : "UNKNOWN";
            String endpoint = parts.length > 1 ? parts[1] : key;

            long totalReqs = stats.getTotalRequests();
            if (totalReqs == 0) continue;

            ApiMetricSnapshot snapshot = ApiMetricSnapshot.builder()
                    .endpoint(endpoint)
                    .httpMethod(method)
                    .snapshotTime(snapshotTime)
                    .requestCount((int) totalReqs)
                    .avgResponseMs(stats.getAvgResponseTimeMs())
                    .maxResponseMs((double) stats.getMaxResponseTimeMs())
                    .p95ResponseMs(stats.getP95ResponseTimeMs())
                    .p99ResponseMs(stats.getP99ResponseTimeMs())
                    .errorCount((int) stats.getTotalErrors())
                    .errorRate(stats.getErrorRate())
                    .build();

            snapshots.add(snapshot);
        }

        snapshotRepository.saveAll(snapshots);
        log.info("Flushed {} API metric snapshots to DB", snapshots.size());
    }

    /**
     * Cleans up old metric snapshots based on the data retention period.
     */
    @Transactional
    public void cleanupOldData() {
        LocalDateTime threshold = LocalDateTime.now(ZoneOffset.UTC).minusDays(dataRetentionDays);
        snapshotRepository.deleteOlderThan(threshold);
        log.info("Cleaned up API metric snapshots older than {} days", dataRetentionDays);
    }

    /**
     * Returns the current alert configuration.
     */
    public MonitoringResponse.AlertConfig getAlertConfig() {
        Map<String, Double> thresholds = new LinkedHashMap<>();
        thresholds.put("cpu_percent", cpuThreshold);
        thresholds.put("memory_percent", memoryThreshold);
        thresholds.put("hikari_active_percent", hikariActiveThreshold);
        thresholds.put("error_rate_percent", errorRateThreshold);
        thresholds.put("slow_api_ms", slowApiThreshold);

        return new MonitoringResponse.AlertConfig(
                slackWebhookUrl,
                monitoringEnabled,
                thresholds
        );
    }

    /**
     * Updates the alert configuration (webhook URL and enabled flag).
     */
    @Transactional
    public MonitoringResponse.AlertConfig updateAlertConfig(String webhookUrl, boolean enabled) {
        // In-memory update only (config values are @Value-injected; for persistent config, use system_config table)
        this.slackWebhookUrl = webhookUrl;
        this.monitoringEnabled = enabled;
        log.info("Updated alert config: enabled={}, webhookUrl={}", enabled,
                webhookUrl != null && !webhookUrl.isEmpty() ? "***" : "(empty)");
        return getAlertConfig();
    }

    // ==================== Private Helpers ====================

    private MonitoringResponse.JvmMetrics collectJvmMetrics() {
        long heapUsed = getGaugeValue("jvm.memory.used", "area", "heap");
        long heapMax = getGaugeValue("jvm.memory.max", "area", "heap");
        double heapUsagePercent = heapMax > 0 ? (double) heapUsed / heapMax * 100.0 : 0.0;
        long nonHeapUsed = getGaugeValue("jvm.memory.used", "area", "nonheap");
        int liveThreads = (int) getGaugeValue("jvm.threads.live");
        int peakThreads = (int) getGaugeValue("jvm.threads.peak");

        long gcPauseCount = 0;
        double gcPauseTotalMs = 0.0;
        Timer gcTimer = meterRegistry.find("jvm.gc.pause").timer();
        if (gcTimer != null) {
            gcPauseCount = gcTimer.count();
            gcPauseTotalMs = gcTimer.totalTime(TimeUnit.MILLISECONDS);
        }

        return new MonitoringResponse.JvmMetrics(
                heapUsed, heapMax, heapUsagePercent, nonHeapUsed,
                liveThreads, peakThreads, gcPauseCount, gcPauseTotalMs
        );
    }

    private MonitoringResponse.HikariMetrics collectHikariMetrics() {
        int active = (int) getGaugeValue("hikaricp.connections.active");
        int idle = (int) getGaugeValue("hikaricp.connections.idle");
        int pending = (int) getGaugeValue("hikaricp.connections.pending");
        int max = (int) getGaugeValue("hikaricp.connections.max");
        int total = active + idle;
        double usagePercent = max > 0 ? (double) active / max * 100.0 : 0.0;

        return new MonitoringResponse.HikariMetrics(active, idle, pending, total, max, usagePercent);
    }

    private MonitoringResponse.ApiMetrics collectApiMetrics() {
        Map<String, ApiMetricsInterceptor.EndpointStats> current = apiMetricsInterceptor.getCurrentMetrics();

        int totalRequests = 0;
        int totalErrors = 0;
        double totalResponseTime = 0;

        List<MonitoringResponse.EndpointMetric> endpointMetrics = new ArrayList<>();

        for (Map.Entry<String, ApiMetricsInterceptor.EndpointStats> entry : current.entrySet()) {
            String key = entry.getKey();
            ApiMetricsInterceptor.EndpointStats stats = entry.getValue();

            String[] parts = key.split(" ", 2);
            String method = parts.length > 0 ? parts[0] : "UNKNOWN";
            String endpoint = parts.length > 1 ? parts[1] : key;

            int reqCount = (int) stats.getTotalRequests();
            totalRequests += reqCount;
            totalErrors += (int) stats.getTotalErrors();
            totalResponseTime += stats.getAvgResponseTimeMs() * reqCount;

            endpointMetrics.add(new MonitoringResponse.EndpointMetric(
                    endpoint,
                    method,
                    reqCount,
                    stats.getAvgResponseTimeMs(),
                    (double) stats.getMaxResponseTimeMs(),
                    stats.getP95ResponseTimeMs(),
                    (int) stats.getTotalErrors()
            ));
        }

        // Sort by avg response time descending, take top 10
        endpointMetrics.sort((a, b) -> Double.compare(b.avgResponseMs(), a.avgResponseMs()));
        List<MonitoringResponse.EndpointMetric> topSlowest = endpointMetrics.stream()
                .limit(10)
                .collect(Collectors.toList());

        // Collect top error endpoints (sorted by error count descending)
        List<MonitoringResponse.ErrorEndpoint> topErrorEndpoints = new ArrayList<>();
        for (Map.Entry<String, ApiMetricsInterceptor.EndpointStats> entry : current.entrySet()) {
            ApiMetricsInterceptor.EndpointStats stats = entry.getValue();
            if (stats.getTotalErrors() > 0) {
                String[] parts = entry.getKey().split(" ", 2);
                String method = parts.length > 0 ? parts[0] : "UNKNOWN";
                String endpoint = parts.length > 1 ? parts[1] : entry.getKey();
                int reqCount = (int) stats.getTotalRequests();
                int errCount = (int) stats.getTotalErrors();
                double endpointErrorRate = reqCount > 0 ? (double) errCount / reqCount * 100.0 : 0.0;
                topErrorEndpoints.add(new MonitoringResponse.ErrorEndpoint(
                        endpoint, method, errCount, reqCount, endpointErrorRate, stats.getStatusCodeCounts()
                ));
            }
        }
        topErrorEndpoints.sort((a, b) -> Integer.compare(b.errorCount(), a.errorCount()));
        topErrorEndpoints = topErrorEndpoints.stream().limit(20).collect(Collectors.toList());

        double errorRate = totalRequests > 0 ? (double) totalErrors / totalRequests * 100.0 : 0.0;
        double avgResponseMs = totalRequests > 0 ? totalResponseTime / totalRequests : 0.0;

        return new MonitoringResponse.ApiMetrics(totalRequests, totalErrors, errorRate, avgResponseMs, topSlowest, topErrorEndpoints);
    }

    private MonitoringResponse.CloudWatchMetrics collectCloudWatchMetrics() {
        if (cloudWatchClient.isEmpty()) {
            return null;
        }

        try {
            MonitoringResponse.Ec2Metrics ec2 = collectEc2Metrics();
            MonitoringResponse.RdsMetrics rds = collectRdsMetrics();
            return new MonitoringResponse.CloudWatchMetrics(ec2, rds);
        } catch (Exception e) {
            log.warn("Failed to collect CloudWatch metrics: {}", e.getMessage());
            return null;
        }
    }

    private MonitoringResponse.Ec2Metrics collectEc2Metrics() {
        if (ec2InstanceId == null || ec2InstanceId.isEmpty()) {
            return null;
        }

        CloudWatchClient client = cloudWatchClient.get();
        Dimension instanceDimension = Dimension.builder()
                .name("InstanceId")
                .value(ec2InstanceId)
                .build();

        double cpuUtilization = getCloudWatchMetric(client, "AWS/EC2", "CPUUtilization",
                List.of(instanceDimension));
        double networkIn = getCloudWatchMetric(client, "AWS/EC2", "NetworkIn",
                List.of(instanceDimension));
        double networkOut = getCloudWatchMetric(client, "AWS/EC2", "NetworkOut",
                List.of(instanceDimension));

        return new MonitoringResponse.Ec2Metrics(cpuUtilization, networkIn, networkOut);
    }

    private MonitoringResponse.RdsMetrics collectRdsMetrics() {
        if (rdsInstanceId == null || rdsInstanceId.isEmpty()) {
            return null;
        }

        CloudWatchClient client = cloudWatchClient.get();
        Dimension dbDimension = Dimension.builder()
                .name("DBInstanceIdentifier")
                .value(rdsInstanceId)
                .build();

        double cpuUtilization = getCloudWatchMetric(client, "AWS/RDS", "CPUUtilization",
                List.of(dbDimension));
        double databaseConnections = getCloudWatchMetric(client, "AWS/RDS", "DatabaseConnections",
                List.of(dbDimension));
        double freeableMemory = getCloudWatchMetric(client, "AWS/RDS", "FreeableMemory",
                List.of(dbDimension));
        double readIops = getCloudWatchMetric(client, "AWS/RDS", "ReadIOPS",
                List.of(dbDimension));
        double writeIops = getCloudWatchMetric(client, "AWS/RDS", "WriteIOPS",
                List.of(dbDimension));

        // Convert freeableMemory from bytes to MB
        double freeableMemoryMb = freeableMemory / (1024.0 * 1024.0);

        return new MonitoringResponse.RdsMetrics(
                cpuUtilization,
                (int) databaseConnections,
                freeableMemoryMb,
                readIops,
                writeIops
        );
    }

    private double getCloudWatchMetric(CloudWatchClient client, String namespace, String metricName,
                                        List<Dimension> dimensions) {
        try {
            Instant endTime = Instant.now();
            Instant startTime = endTime.minus(Duration.ofMinutes(5));

            GetMetricStatisticsRequest request = GetMetricStatisticsRequest.builder()
                    .namespace(namespace)
                    .metricName(metricName)
                    .dimensions(dimensions)
                    .startTime(startTime)
                    .endTime(endTime)
                    .period(300)
                    .statistics(Statistic.AVERAGE)
                    .build();

            GetMetricStatisticsResponse response = client.getMetricStatistics(request);

            return response.datapoints().stream()
                    .findFirst()
                    .map(Datapoint::average)
                    .orElse(0.0);
        } catch (Exception e) {
            log.warn("Failed to get CloudWatch metric {}/{}: {}", namespace, metricName, e.getMessage());
            return 0.0;
        }
    }

    private long getGaugeValue(String name, String... tags) {
        try {
            var gauge = meterRegistry.find(name);
            if (tags.length >= 2) {
                gauge = gauge.tag(tags[0], tags[1]);
            }
            var meter = gauge.gauge();
            if (meter != null) {
                return (long) meter.value();
            }
        } catch (Exception e) {
            log.debug("Failed to get gauge value for {}: {}", name, e.getMessage());
        }
        return 0;
    }

    /**
     * Returns AI API usage metrics for the given period.
     */
    public MonitoringResponse.AiUsageMetrics getAiUsageMetrics(int days) {
        LocalDateTime since = LocalDateTime.now(ZoneOffset.UTC).minusDays(days);

        List<AiUsageLog> logs = aiUsageLogRepository.findByCreatedAtAfter(since);

        int totalCalls = logs.size();
        long totalInput = logs.stream().mapToLong(AiUsageLog::getInputTokens).sum();
        long totalOutput = logs.stream().mapToLong(AiUsageLog::getOutputTokens).sum();
        double totalCost = logs.stream().mapToDouble(AiUsageLog::getEstimatedCostUsd).sum();

        // By board
        List<Object[]> boardRows = aiUsageLogRepository.findUsageByBoardSince(since);
        List<MonitoringResponse.AiUsageByBoard> byBoard = boardRows.stream()
                .limit(10)
                .map(row -> {
                    String boardId = (String) row[0];
                    String boardName = boardRepository.findById(boardId)
                            .map(Board::getName)
                            .orElse(boardId);
                    return new MonitoringResponse.AiUsageByBoard(
                            boardId, boardName,
                            ((Number) row[1]).longValue(),
                            ((Number) row[2]).longValue(),
                            ((Number) row[3]).doubleValue(),
                            ((Number) row[4]).intValue()
                    );
                })
                .toList();

        // By feature type
        List<Object[]> featureRows = aiUsageLogRepository.findUsageByFeatureTypeSince(since);
        List<MonitoringResponse.AiUsageByFeature> byFeature = featureRows.stream()
                .map(row -> new MonitoringResponse.AiUsageByFeature(
                        (String) row[0],
                        ((Number) row[1]).longValue(),
                        ((Number) row[2]).longValue(),
                        ((Number) row[3]).doubleValue(),
                        ((Number) row[4]).intValue()
                ))
                .toList();

        // Daily trend
        List<Object[]> dailyRows = aiUsageLogRepository.findDailyTrendSince(since);
        List<MonitoringResponse.AiUsageDailyTrend> dailyTrend = dailyRows.stream()
                .map(row -> new MonitoringResponse.AiUsageDailyTrend(
                        row[0].toString(),
                        ((Number) row[1]).longValue(),
                        ((Number) row[2]).longValue(),
                        ((Number) row[3]).doubleValue(),
                        ((Number) row[4]).intValue()
                ))
                .toList();

        return new MonitoringResponse.AiUsageMetrics(
                totalCalls, totalInput, totalOutput, totalCost,
                byBoard, byFeature, dailyTrend
        );
    }
}
