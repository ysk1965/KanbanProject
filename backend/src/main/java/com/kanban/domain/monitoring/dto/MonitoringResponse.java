package com.kanban.domain.monitoring.dto;

import java.util.List;
import java.util.Map;

public class MonitoringResponse {

    // JVM 메트릭
    public record JvmMetrics(
        long heapUsed,       // bytes
        long heapMax,        // bytes
        double heapUsagePercent,
        long nonHeapUsed,
        int liveThreads,
        int peakThreads,
        long gcPauseCount,
        double gcPauseTotalMs
    ) {}

    // HikariCP 메트릭
    public record HikariMetrics(
        int activeConnections,
        int idleConnections,
        int pendingConnections,
        int totalConnections,
        int maxConnections,
        double usagePercent
    ) {}

    // API 메트릭 (인터셉터에서 수집된 실시간 데이터)
    public record ApiMetrics(
        int totalRequests,
        int totalErrors,
        double errorRate,
        double avgResponseMs,
        List<EndpointMetric> topSlowestEndpoints,
        List<ErrorEndpoint> topErrorEndpoints
    ) {}

    public record EndpointMetric(
        String endpoint,
        String httpMethod,
        int requestCount,
        double avgResponseMs,
        double maxResponseMs,
        double p95ResponseMs,
        int errorCount
    ) {}

    // 에러 엔드포인트 상세 (상태 코드별 분류)
    public record ErrorEndpoint(
        String endpoint,
        String httpMethod,
        int errorCount,
        int requestCount,
        double errorRate,
        Map<Integer, Long> statusCodes
    ) {}

    // CloudWatch 메트릭
    public record CloudWatchMetrics(
        Ec2Metrics ec2,
        RdsMetrics rds
    ) {}

    public record Ec2Metrics(
        double cpuUtilization,
        double networkIn,
        double networkOut
    ) {}

    public record RdsMetrics(
        double cpuUtilization,
        int databaseConnections,
        double freeableMemoryMb,
        double readIops,
        double writeIops
    ) {}

    // 시간별 API 메트릭 (차트용)
    public record ApiMetricHistory(
        List<ApiMetricSnapshotDto> snapshots
    ) {}

    public record ApiMetricSnapshotDto(
        String endpoint,
        String httpMethod,
        String snapshotTime,
        int requestCount,
        double avgResponseMs,
        double maxResponseMs,
        double p95ResponseMs,
        double p99ResponseMs,
        int errorCount,
        double errorRate
    ) {}

    // 통합 대시보드 응답
    public record Dashboard(
        JvmMetrics jvm,
        HikariMetrics hikari,
        ApiMetrics api,
        CloudWatchMetrics cloudWatch,
        String serverTime
    ) {}

    // Slack 알림 설정
    public record AlertConfig(
        String slackWebhookUrl,
        boolean enabled,
        Map<String, Double> thresholds
    ) {}

    // AI 사용량 메트릭
    public record AiUsageMetrics(
        int totalCalls,
        long totalInputTokens,
        long totalOutputTokens,
        double totalEstimatedCostUsd,
        List<AiUsageByBoard> byBoard,
        List<AiUsageByFeature> byFeature,
        List<AiUsageDailyTrend> dailyTrend
    ) {}

    public record AiUsageByBoard(
        String boardId,
        String boardName,
        long inputTokens,
        long outputTokens,
        double estimatedCostUsd,
        int callCount
    ) {}

    public record AiUsageByFeature(
        String featureType,
        long inputTokens,
        long outputTokens,
        double estimatedCostUsd,
        int callCount
    ) {}

    public record AiUsageDailyTrend(
        String date,
        long inputTokens,
        long outputTokens,
        double estimatedCostUsd,
        int callCount
    ) {}

    // OpenAI 계정 빌링 (Organization API)
    public record OpenAIBilling(
        boolean connected,
        Double totalCostUsd,
        List<OpenAIDailyCost> dailyCosts,
        List<OpenAIModelUsage> modelUsage
    ) {}

    public record OpenAIDailyCost(
        String date,
        double amountUsd
    ) {}

    public record OpenAIModelUsage(
        String model,
        long inputTokens,
        long outputTokens,
        int requests
    ) {}
}
