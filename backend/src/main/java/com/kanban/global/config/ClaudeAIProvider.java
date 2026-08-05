package com.kanban.global.config;

import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Claude 호출 프로바이더.
 *
 * <p><b>{@code ai.provider} 값과 무관하게 항상 빈으로 등록된다.</b> Claude를 반드시 써야 하는
 * 기능(예: 커밋 플랜 생성)이 이 타입을 직접 주입해 쓸 수 있어야 하기 때문이다. 이전에는
 * {@code @ConditionalOnProperty(havingValue = "claude")}가 붙어 있어서 {@code ai.provider=openai}
 * (dev·prod 현재값)에서는 빈 자체가 없었고, 범용 {@link AIProvider}로 우회하면 Claude 대신
 * OpenAI가 조용히 호출됐다.
 *
 * <p>일반 AI 기능의 라우팅은 그대로다 — {@code ai.provider=openai}면
 * {@link OpenAIProvider}가 {@code @Primary}로 선택된다.
 */
@Slf4j
@Component
public class ClaudeAIProvider implements AIProvider {

    private static final String CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

    private final RestTemplate aiRestTemplate;
    private final AiApiKeyResolver apiKeyResolver;

    public ClaudeAIProvider(@Qualifier("aiRestTemplate") RestTemplate aiRestTemplate,
                            AiApiKeyResolver apiKeyResolver) {
        this.aiRestTemplate = aiRestTemplate;
        this.apiKeyResolver = apiKeyResolver;
    }

    /**
     * structured outputs 호출 결과. 일반 {@link AIResponse}와 달리 {@code stopReason}을 노출한다 —
     * 호출부가 {@code refusal}/{@code max_tokens}를 서로 다른 HTTP 상태로 매핑해야 하기 때문이다.
     *
     * @param json {@code output_config.format} 스키마를 만족하는 JSON 문자열
     */
    public record StructuredResponse(String json, String stopReason,
                                     int inputTokens, int outputTokens, String model) {
    }

    /**
     * JSON 스키마를 강제해 호출한다({@code output_config.format}). 스키마가 보장되므로
     * 호출부에서 파싱 실패를 다룰 필요가 없다.
     *
     * <p>일반 {@link #chatWithUsage} 경로와 달리 프로바이더 오류를 상태별로 구분해 던진다:
     * 429는 {@link ErrorCode#AI_PROVIDER_RATE_LIMITED}, 그 외 실패는
     * {@link ErrorCode#AI_PROVIDER_UNAVAILABLE}. {@code stopReason} 해석은 호출부 몫이다.
     *
     * @param jsonSchema JSON Schema (Anthropic structured outputs 제약을 만족해야 한다)
     */
    public StructuredResponse chatStructured(String systemPrompt, String userPrompt, String model,
                                             int maxTokens, Map<String, Object> jsonSchema) {
        String apiKey = apiKeyResolver.resolveKey(AiProviderType.CLAUDE);
        if (apiKey == null || apiKey.isBlank()) {
            throw new BusinessException(ErrorCode.AI_SERVICE_UNAVAILABLE);
        }

        Map<String, Object> requestBody = new LinkedHashMap<>();
        requestBody.put("model", model);
        requestBody.put("max_tokens", maxTokens);
        // 시스템 프롬프트는 호출 간 거의 동일하므로 캐시 브레이크포인트를 둔다
        requestBody.put("system", List.of(Map.of(
                "type", "text",
                "text", systemPrompt,
                "cache_control", Map.of("type", "ephemeral")
        )));
        requestBody.put("messages", List.of(Map.of("role", "user", "content", userPrompt)));
        requestBody.put("output_config", Map.of(
                "format", Map.of("type", "json_schema", "schema", jsonSchema)
        ));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("x-api-key", apiKey);
        headers.set("anthropic-version", "2023-06-01");

        ResponseEntity<Map> response;
        try {
            log.info("Calling Claude API (structured) with model: {}", model);
            response = aiRestTemplate.postForEntity(
                    CLAUDE_API_URL, new HttpEntity<>(requestBody, headers), Map.class);
        } catch (HttpClientErrorException.TooManyRequests e) {
            log.warn("Claude API rate limited");
            throw new BusinessException(ErrorCode.AI_PROVIDER_RATE_LIMITED);
        } catch (HttpStatusCodeException e) {
            // 사유까지 남긴다 — 상태코드만으로는 "크레딧 소진"과 "요청 형식 오류"가 구분되지 않아
            // 장애를 로그만 보고 진단할 수 없었다. 길이 제한은 AiProviderErrors 참고.
            ErrorCode code = AiProviderErrors.classify(e, ErrorCode.AI_PROVIDER_UNAVAILABLE);
            log.error("Claude API returned {} (structured) [{}] — {}",
                    e.getStatusCode().value(), code.getCode(), AiProviderErrors.describe(e));
            throw new BusinessException(code);
        } catch (Exception e) {
            log.error("Failed to call Claude API (structured): {}", e.getMessage());
            throw new BusinessException(ErrorCode.AI_PROVIDER_UNAVAILABLE);
        }

        Map<String, Object> body = response.getBody();
        if (body == null) {
            throw new BusinessException(ErrorCode.AI_PROVIDER_UNAVAILABLE);
        }
        return new StructuredResponse(
                extractText(body),
                (String) body.get("stop_reason"),
                usageValue(body, "input_tokens"),
                usageValue(body, "output_tokens"),
                model);
    }

    /**
     * 첫 text 블록을 꺼낸다. {@code stop_reason=refusal}이면 content가 비어 있을 수 있으므로
     * 여기서 예외를 던지지 않고 {@code null}을 돌려준다 — 판정은 호출부에서 한다.
     */
    @SuppressWarnings("unchecked")
    private String extractText(Map<String, Object> body) {
        try {
            List<Map<String, Object>> content = (List<Map<String, Object>>) body.get("content");
            if (content == null) return null;
            return content.stream()
                    .filter(block -> "text".equals(block.get("type")))
                    .map(block -> (String) block.get("text"))
                    .findFirst()
                    .orElse(null);
        } catch (Exception e) {
            log.error("Failed to parse Claude structured response content: {}", e.getMessage());
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private int usageValue(Map<String, Object> body, String field) {
        try {
            Map<String, Object> usage = (Map<String, Object>) body.get("usage");
            if (usage == null) return 0;
            return ((Number) usage.getOrDefault(field, 0)).intValue();
        } catch (Exception e) {
            return 0;
        }
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
        String apiKey = apiKeyResolver.resolveKey(AiProviderType.CLAUDE);
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
        } catch (HttpStatusCodeException e) {
            // 원인이 특정되는 실패(크레딧·키·한도)는 그대로 드러낸다. 나머지는 기존 계약 유지.
            ErrorCode code = AiProviderErrors.classify(e, ErrorCode.AI_REPORT_GENERATION_FAILED);
            log.error("Claude API returned {} [{}] — {}",
                    e.getStatusCode().value(), code.getCode(), AiProviderErrors.describe(e));
            throw new BusinessException(code);
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
