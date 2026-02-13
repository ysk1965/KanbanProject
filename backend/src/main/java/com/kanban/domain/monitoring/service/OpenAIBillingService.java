package com.kanban.domain.monitoring.service;

import com.kanban.domain.monitoring.dto.MonitoringResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Slf4j
@Service
public class OpenAIBillingService {

    private static final String COSTS_URL = "https://api.openai.com/v1/organization/costs";
    private static final String USAGE_COMPLETIONS_URL = "https://api.openai.com/v1/organization/usage/completions";

    private final RestTemplate restTemplate;

    @Value("${ai.openai.admin-key:}")
    private String adminKey;

    public OpenAIBillingService(@Qualifier("aiRestTemplate") RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public boolean isConnected() {
        return adminKey != null && !adminKey.isBlank();
    }

    /**
     * Fetches OpenAI billing data: daily costs and usage by model for the last N days.
     */
    public MonitoringResponse.OpenAIBilling getBilling(int days) {
        if (!isConnected()) {
            return new MonitoringResponse.OpenAIBilling(false, null, List.of(), List.of());
        }

        try {
            long startTime = Instant.now().minusSeconds((long) days * 24 * 60 * 60).getEpochSecond();
            List<MonitoringResponse.OpenAIDailyCost> dailyCosts = fetchDailyCosts(startTime, days);
            List<MonitoringResponse.OpenAIModelUsage> modelUsage = fetchModelUsage(startTime, days);

            double totalCost = dailyCosts.stream()
                    .mapToDouble(MonitoringResponse.OpenAIDailyCost::amountUsd)
                    .sum();

            return new MonitoringResponse.OpenAIBilling(true, totalCost, dailyCosts, modelUsage);
        } catch (Exception e) {
            log.error("Failed to fetch OpenAI billing data: {}", e.getMessage(), e);
            return new MonitoringResponse.OpenAIBilling(true, null, List.of(), List.of());
        }
    }

    @SuppressWarnings("unchecked")
    private List<MonitoringResponse.OpenAIDailyCost> fetchDailyCosts(long startTime, int days) {
        try {
            String url = COSTS_URL + "?start_time=" + startTime + "&bucket_width=1d&limit=" + days;
            HttpEntity<Void> entity = new HttpEntity<>(createHeaders());

            ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.GET, entity, Map.class);

            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                return List.of();
            }

            List<Map<String, Object>> data = (List<Map<String, Object>>) response.getBody().get("data");
            if (data == null) return List.of();

            List<MonitoringResponse.OpenAIDailyCost> costs = new ArrayList<>();
            for (Map<String, Object> bucket : data) {
                long bucketStart = ((Number) bucket.get("start_time")).longValue();
                String date = LocalDate.ofInstant(Instant.ofEpochSecond(bucketStart), ZoneOffset.UTC)
                        .format(DateTimeFormatter.ISO_LOCAL_DATE);

                List<Map<String, Object>> results = (List<Map<String, Object>>) bucket.get("results");
                double dayTotal = 0.0;
                if (results != null) {
                    for (Map<String, Object> result : results) {
                        Map<String, Object> amount = (Map<String, Object>) result.get("amount");
                        if (amount != null) {
                            dayTotal += ((Number) amount.getOrDefault("value", 0)).doubleValue();
                        }
                    }
                }
                costs.add(new MonitoringResponse.OpenAIDailyCost(date, dayTotal));
            }
            return costs;
        } catch (Exception e) {
            log.warn("Failed to fetch OpenAI daily costs: {}", e.getMessage());
            return List.of();
        }
    }

    @SuppressWarnings("unchecked")
    private List<MonitoringResponse.OpenAIModelUsage> fetchModelUsage(long startTime, int days) {
        try {
            String url = USAGE_COMPLETIONS_URL + "?start_time=" + startTime
                    + "&bucket_width=1d&limit=" + days + "&group_by=model";
            HttpEntity<Void> entity = new HttpEntity<>(createHeaders());

            ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.GET, entity, Map.class);

            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                return List.of();
            }

            List<Map<String, Object>> data = (List<Map<String, Object>>) response.getBody().get("data");
            if (data == null) return List.of();

            // Aggregate across all buckets, grouped by model
            Map<String, long[]> modelAgg = new LinkedHashMap<>(); // model -> [input, output, requests]

            for (Map<String, Object> bucket : data) {
                List<Map<String, Object>> results = (List<Map<String, Object>>) bucket.get("results");
                if (results == null) continue;

                for (Map<String, Object> result : results) {
                    String model = (String) result.get("model");
                    if (model == null) model = "unknown";

                    long input = ((Number) result.getOrDefault("input_tokens", 0)).longValue();
                    long output = ((Number) result.getOrDefault("output_tokens", 0)).longValue();
                    int requests = ((Number) result.getOrDefault("num_model_requests", 0)).intValue();

                    modelAgg.computeIfAbsent(model, k -> new long[3]);
                    long[] agg = modelAgg.get(model);
                    agg[0] += input;
                    agg[1] += output;
                    agg[2] += requests;
                }
            }

            return modelAgg.entrySet().stream()
                    .map(e -> new MonitoringResponse.OpenAIModelUsage(
                            e.getKey(), e.getValue()[0], e.getValue()[1], (int) e.getValue()[2]))
                    .sorted((a, b) -> Long.compare(
                            b.inputTokens() + b.outputTokens(),
                            a.inputTokens() + a.outputTokens()))
                    .toList();
        } catch (Exception e) {
            log.warn("Failed to fetch OpenAI model usage: {}", e.getMessage());
            return List.of();
        }
    }

    private HttpHeaders createHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(adminKey);
        return headers;
    }
}
