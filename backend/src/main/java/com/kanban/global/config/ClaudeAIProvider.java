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
        if (apiKey == null || apiKey.isBlank()) {
            throw new BusinessException(ErrorCode.AI_SERVICE_UNAVAILABLE);
        }

        try {
            Map<String, Object> requestBody = Map.of(
                    "model", model,
                    "max_tokens", maxTokens,
                    "system", List.of(Map.of(
                            "type", "text",
                            "text", systemPrompt,
                            "cache_control", Map.of("type", "ephemeral")
                    )),
                    "messages", List.of(Map.of("role", "user", "content", userPrompt))
            );

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("x-api-key", apiKey);
            headers.set("anthropic-version", "2023-06-01");

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            log.info("Calling Claude API with model: {}", model);
            ResponseEntity<Map> response = aiRestTemplate.postForEntity(CLAUDE_API_URL, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return extractContent(response.getBody());
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
    private String extractContent(Map<String, Object> responseBody) {
        try {
            List<Map<String, Object>> contentList = (List<Map<String, Object>>) responseBody.get("content");
            if (contentList != null && !contentList.isEmpty()) {
                Map<String, Object> firstContent = contentList.get(0);
                if ("text".equals(firstContent.get("type"))) {
                    return (String) firstContent.get("text");
                }
            }
        } catch (Exception e) {
            log.error("Failed to parse Claude API response: {}", e.getMessage());
        }
        throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED);
    }
}
