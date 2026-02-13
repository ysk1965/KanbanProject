package com.kanban.global.interceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Component
public class ApiMetricsInterceptor implements HandlerInterceptor {

    private static final String START_TIME_ATTR = "api.metrics.startTime";
    private static final int MAX_ENDPOINTS = 500;
    private static final int RECENT_BUFFER_SIZE = 100;

    private final ConcurrentHashMap<String, EndpointStats> metricsMap = new ConcurrentHashMap<>();

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
        String path = request.getRequestURI();
        String key = method + " " + path;

        int statusCode = response.getStatus();
        boolean isError = statusCode >= 400 || ex != null;

        try {
            enforceMaxEndpoints();

            EndpointStats stats = metricsMap.computeIfAbsent(key, k -> new EndpointStats());
            stats.record(duration, isError, statusCode);
        } catch (Exception e) {
            log.debug("Failed to record API metrics for {}: {}", key, e.getMessage());
        }
    }

    private void enforceMaxEndpoints() {
        if (metricsMap.size() >= MAX_ENDPOINTS) {
            // Remove the endpoint with the fewest requests (least active)
            String leastActiveKey = null;
            long minRequests = Long.MAX_VALUE;
            for (Map.Entry<String, EndpointStats> entry : metricsMap.entrySet()) {
                long requests = entry.getValue().getTotalRequests();
                if (requests < minRequests) {
                    minRequests = requests;
                    leastActiveKey = entry.getKey();
                }
            }
            if (leastActiveKey != null) {
                metricsMap.remove(leastActiveKey);
            }
        }
    }

    /**
     * Returns current metrics and resets the map (for periodic flushing to DB).
     */
    public Map<String, EndpointStats> getAndResetMetrics() {
        Map<String, EndpointStats> snapshot = new HashMap<>(metricsMap);
        metricsMap.clear();
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
