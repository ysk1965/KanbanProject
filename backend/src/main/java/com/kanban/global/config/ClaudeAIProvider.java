package com.kanban.global.config;

import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@ConditionalOnProperty(name = "ai.provider", havingValue = "claude", matchIfMissing = true)
public class ClaudeAIProvider implements AIProvider {

    private static final String CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

    private final RestTemplate aiRestTemplate;

    @Value("${ai.claude.api-key:}")
    private String apiKey;

    public ClaudeAIProvider(@Qualifier("aiRestTemplate") RestTemplate aiRestTemplate) {
        this.aiRestTemplate = aiRestTemplate;
    }

    @Override
    public String chat(String systemPrompt, String userPrompt, String model, int maxTokens) {
        return chatWithUsage(systemPrompt, userPrompt, model, maxTokens).content();
    }

    @Override
    public AIResponse chatWithUsage(String systemPrompt, String userPrompt, String model, int maxTokens) {
        return chatWithUsage(systemPrompt, userPrompt, model, maxTokens, null);
    }

    @Override
    public AIResponse chatWithUsage(String systemPrompt, String userPrompt, String model, int maxTokens,
                                    Double temperature) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new BusinessException(ErrorCode.AI_SERVICE_UNAVAILABLE);
        }

        try {
            Map<String, Object> requestBody = new LinkedHashMap<>();
            requestBody.put("model", model);
            requestBody.put("max_tokens", maxTokens);
            if (temperature != null) {
                requestBody.put("temperature", temperature);
            }
            requestBody.put("system", List.of(Map.of(
                    "type", "text",
                    "text", systemPrompt,
                    "cache_control", Map.of("type", "ephemeral")
            )));
            requestBody.put("messages", List.of(Map.of("role", "user", "content", userPrompt)));

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("x-api-key", apiKey);
            headers.set("anthropic-version", "2023-06-01");

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            log.info("Calling Claude API with model: {}", model);
            ResponseEntity<Map> response = aiRestTemplate.postForEntity(CLAUDE_API_URL, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return extractResponse(response.getBody(), model);
            }

            log.error("Claude API returned non-success status: {}", response.getStatusCode());
            throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to call Claude API: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED);
        }
    }

    @SuppressWarnings("unchecked")
    private AIResponse extractResponse(Map<String, Object> responseBody, String model) {
        String content = null;
        int inputTokens = 0;
        int outputTokens = 0;

        try {
            List<Map<String, Object>> contentList = (List<Map<String, Object>>) responseBody.get("content");
            if (contentList != null && !contentList.isEmpty()) {
                Map<String, Object> firstContent = contentList.get(0);
                if ("text".equals(firstContent.get("type"))) {
                    content = (String) firstContent.get("text");
                }
            }
        } catch (Exception e) {
            log.error("Failed to parse Claude API response content: {}", e.getMessage());
        }

        try {
            Map<String, Object> usage = (Map<String, Object>) responseBody.get("usage");
            if (usage != null) {
                inputTokens = ((Number) usage.getOrDefault("input_tokens", 0)).intValue();
                outputTokens = ((Number) usage.getOrDefault("output_tokens", 0)).intValue();
            }
        } catch (Exception e) {
            log.debug("Failed to parse Claude usage data: {}", e.getMessage());
        }

        if (content == null) {
            throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED);
        }

        return new AIResponse(content, inputTokens, outputTokens, model);
    }
}
