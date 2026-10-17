package com.kanban.global.interceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

@Slf4j
@Component
public class ApiMetricsInterceptor implements HandlerInterceptor {

    private static final String START_TIME_ATTR = "api.metrics.startTime";
    /**
     * 키는 라우트 패턴("/api/v1/boards/{boardId}")이라 실제 엔드포인트 수(수백)에 수렴한다.
     * 그래도 혹시 모를 폭주에 대비해 상한을 두고, 넘으면 새 키는 버린다 (기존 키 집계는 계속).
     * 맵은 MonitoringService.flushMetricsToDb 가 주기적으로 비우므로 상한에 걸려도 한 주기 안에 풀린다.
     */
    private static final int MAX_ENDPOINTS = 2000;
    private static final int RECENT_BUFFER_SIZE = 100;

    /** 라우트 패턴을 못 얻었을 때 URI 의 UUID / 숫자 세그먼트를 {id} 로 접는다. */
    private static final Pattern UUID_SEGMENT = Pattern.compile(
            "/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?=/|$)");
    private static final Pattern NUMERIC_SEGMENT = Pattern.compile("/\\d+(?=/|$)");

    private final ConcurrentHashMap<String, EndpointStats> metricsMap = new ConcurrentHashMap<>();
    private final AtomicBoolean capWarned = new AtomicBoolean(false);

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        request.setAttribute(START_TIME_ATTR, System.currentTimeMillis());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                 Object handler, Exception ex) {
        Long startTime = (Long) request.getAttribute(START_TIME_ATTR);
        if (startTime == null) {
            return;
        }

        long duration = System.currentTimeMillis() - startTime;
        String method = request.getMethod();
        String key = method + " " + resolveRoute(request);

        int statusCode = response.getStatus();
        boolean isError = statusCode >= 400 || ex != null;

        try {
            EndpointStats stats = metricsMap.get(key);
            if (stats == null) {
                if (metricsMap.size() >= MAX_ENDPOINTS) {
                    if (capWarned.compareAndSet(false, true)) {
                        log.warn("API metrics endpoint cap ({}) reached; new endpoint keys are dropped until next flush",
                                MAX_ENDPOINTS);
                    }
                    return;
                }
                stats = metricsMap.computeIfAbsent(key, k -> new EndpointStats());
            }
            stats.record(duration, isError, statusCode);
        } catch (Exception e) {
            log.debug("Failed to record API metrics for {}: {}", key, e.getMessage());
        }
    }

    /**
     * 매칭된 핸들러의 라우트 패턴(예: /api/v1/boards/{boardId})을 키로 쓴다.
     * 실제 URI 를 키로 쓰면 UUID 마다 항목이 생겨 맵이 무한히 자랐다.
     * 패턴이 없으면(404 등) URI 의 UUID/숫자 세그먼트를 {id} 로 접어 같은 효과를 낸다.
     */
    private static String resolveRoute(HttpServletRequest request) {
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        if (pattern instanceof String p && !p.isBlank()) {
            return p;
        }
        String uri = request.getRequestURI();
        if (uri == null) return "/";
        uri = UUID_SEGMENT.matcher(uri).replaceAll("/{id}");
        return NUMERIC_SEGMENT.matcher(uri).replaceAll("/{id}");
    }

    /**
     * Returns current metrics and resets the map (for periodic flushing to DB).
     */
    public Map<String, EndpointStats> getAndResetMetrics() {
        Map<String, EndpointStats> snapshot = new HashMap<>(metricsMap);
        metricsMap.clear();
        capWarned.set(false);
        return snapshot;
    }

    /**
     * Returns current metrics without resetting (for real-time dashboard queries).
     */
    public Map<String, EndpointStats> getCurrentMetrics() {
        return new HashMap<>(metricsMap);
    }

    /**
     * Thread-safe endpoint statistics with circular buffer for percentile calculation.
     */
    public static class EndpointStats {
        private final AtomicLong totalRequests = new AtomicLong();
        private final AtomicLong totalErrors = new AtomicLong();
        private final AtomicLong totalResponseTimeMs = new AtomicLong();
        private final AtomicLong maxResponseTimeMs = new AtomicLong();
        private final double[] recentResponseTimes = new double[RECENT_BUFFER_SIZE];
        private final AtomicInteger recentIndex = new AtomicInteger();
        private final AtomicInteger recentCount = new AtomicInteger();
        private final ConcurrentHashMap<Integer, AtomicLong> statusCodeCounts = new ConcurrentHashMap<>();

        public void record(long responseTimeMs, boolean isError) {
            record(responseTimeMs, isError, 0);
        }

        public void record(long responseTimeMs, boolean isError, int statusCode) {
            totalRequests.incrementAndGet();
            totalResponseTimeMs.addAndGet(responseTimeMs);

            if (isError) {
                totalErrors.incrementAndGet();
            }

            if (statusCode >= 400) {
                statusCodeCounts.computeIfAbsent(statusCode, k -> new AtomicLong()).incrementAndGet();
            }

            // Update max response time atomically
            long currentMax;
            do {
                currentMax = maxResponseTimeMs.get();
                if (responseTimeMs <= currentMax) {
                    break;
                }
            } while (!maxResponseTimeMs.compareAndSet(currentMax, responseTimeMs));

            // Store in circular buffer
            int idx = Math.abs(recentIndex.getAndIncrement() % RECENT_BUFFER_SIZE);
            recentResponseTimes[idx] = responseTimeMs;
            int count = recentCount.get();
            if (count < RECENT_BUFFER_SIZE) {
                recentCount.compareAndSet(count, count + 1);
            }
        }

        public long getTotalRequests() {
            return totalRequests.get();
        }

        public long getTotalErrors() {
            return totalErrors.get();
        }

        public double getAvgResponseTimeMs() {
            long requests = totalRequests.get();
            if (requests == 0) return 0.0;
            return (double) totalResponseTimeMs.get() / requests;
        }

        public long getMaxResponseTimeMs() {
            return maxResponseTimeMs.get();
        }

        public double getErrorRate() {
            long requests = totalRequests.get();
            if (requests == 0) return 0.0;
            return (double) totalErrors.get() / requests * 100.0;
        }

        public Map<Integer, Long> getStatusCodeCounts() {
            Map<Integer, Long> result = new HashMap<>();
            statusCodeCounts.forEach((code, count) -> result.put(code, count.get()));
            return result;
        }

        public double getP95ResponseTimeMs() {
            return getPercentile(95);
        }

        public double getP99ResponseTimeMs() {
            return getPercentile(99);
        }

        private double getPercentile(int percentile) {
            int count = recentCount.get();
            if (count == 0) return 0.0;

            double[] sorted = new double[count];
            System.arraycopy(recentResponseTimes, 0, sorted, 0, count);
            Arrays.sort(sorted);

            int index = (int) Math.ceil(percentile / 100.0 * count) - 1;
            if (index < 0) index = 0;
            if (index >= count) index = count - 1;
            return sorted[index];
        }
    }
}
