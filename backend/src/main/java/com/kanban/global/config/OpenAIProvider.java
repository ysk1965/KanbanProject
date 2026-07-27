package com.kanban.global.config;

import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@ConditionalOnProperty(name = "ai.provider", havingValue = "openai")
public class OpenAIProvider implements AIProvider {

    private static final String OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

    private final RestTemplate aiRestTemplate;
    private final AiApiKeyResolver apiKeyResolver;

    public OpenAIProvider(@Qualifier("aiRestTemplate") RestTemplate aiRestTemplate,
                          AiApiKeyResolver apiKeyResolver) {
        this.aiRestTemplate = aiRestTemplate;
        this.apiKeyResolver = apiKeyResolver;
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
        // 매 호출마다 해석한다 — 관리자가 키를 교체하면 재배포 없이 반영돼야 한다.
        String apiKey = apiKeyResolver.resolveKey(AiProviderType.OPENAI);
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
            requestBody.put("messages", List.of(
                    Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user", "content", userPrompt)
            ));

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            log.info("Calling OpenAI API with model: {}", model);
            ResponseEntity<Map> response = aiRestTemplate.postForEntity(OPENAI_API_URL, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return extractResponse(response.getBody(), model);
            }

            log.error("OpenAI API returned non-success status: {}", response.getStatusCode());
            throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to call OpenAI API: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED);
        }
    }

    @SuppressWarnings("unchecked")
    private AIResponse extractResponse(Map<String, Object> responseBody, String model) {
        String content = null;
        int inputTokens = 0;
        int outputTokens = 0;

        try {
            List<Map<String, Object>> choices = (List<Map<String, Object>>) responseBody.get("choices");
            if (choices != null && !choices.isEmpty()) {
                Map<String, Object> firstChoice = choices.get(0);
                Map<String, Object> message = (Map<String, Object>) firstChoice.get("message");
                if (message != null) {
                    content = (String) message.get("content");
                }
            }
        } catch (Exception e) {
            log.error("Failed to parse OpenAI API response content: {}", e.getMessage());
        }

        try {
            Map<String, Object> usage = (Map<String, Object>) responseBody.get("usage");
            if (usage != null) {
                inputTokens = ((Number) usage.getOrDefault("prompt_tokens", 0)).intValue();
                outputTokens = ((Number) usage.getOrDefault("completion_tokens", 0)).intValue();
            }
        } catch (Exception e) {
            log.debug("Failed to parse OpenAI usage data: {}", e.getMessage());
        }

        if (content == null) {
            throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED);
        }

        return new AIResponse(content, inputTokens, outputTokens, model);
    }
}
