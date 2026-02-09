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
@ConditionalOnProperty(name = "ai.provider", havingValue = "openai")
public class OpenAIProvider implements AIProvider {

    private static final String OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

    private final RestTemplate aiRestTemplate;

    @Value("${ai.openai.api-key:}")
    private String apiKey;

    public OpenAIProvider(@Qualifier("aiRestTemplate") RestTemplate aiRestTemplate) {
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
                    "messages", List.of(
                            Map.of("role", "system", "content", systemPrompt),
                            Map.of("role", "user", "content", userPrompt)
                    )
            );

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            log.info("Calling OpenAI API with model: {}", model);
            ResponseEntity<Map> response = aiRestTemplate.postForEntity(OPENAI_API_URL, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return extractContent(response.getBody());
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
    private String extractContent(Map<String, Object> responseBody) {
        try {
            List<Map<String, Object>> choices = (List<Map<String, Object>>) responseBody.get("choices");
            if (choices != null && !choices.isEmpty()) {
                Map<String, Object> firstChoice = choices.get(0);
                Map<String, Object> message = (Map<String, Object>) firstChoice.get("message");
                if (message != null) {
                    return (String) message.get("content");
                }
            }
        } catch (Exception e) {
            log.error("Failed to parse OpenAI API response: {}", e.getMessage());
        }
        throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED);
    }
}
