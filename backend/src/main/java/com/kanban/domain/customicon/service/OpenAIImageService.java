package com.kanban.domain.customicon.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.customicon.dto.CustomIconResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Slf4j
@Service
public class OpenAIImageService {

    private static final String OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
    private static final String OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";

    private final RestTemplate aiRestTemplate;
    private final ObjectMapper objectMapper;

    @Value("${ai.openai.api-key:}")
    private String apiKey;

    @Value("${app.customicon.vision-model:gpt-4o}")
    private String visionModel;

    @Value("${app.customicon.image-model:dall-e-3}")
    private String imageModel;

    @Value("${app.customicon.image-size:1024x1024}")
    private String imageSize;

    public OpenAIImageService(@Qualifier("aiRestTemplate") RestTemplate aiRestTemplate,
                              ObjectMapper objectMapper) {
        this.aiRestTemplate = aiRestTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * GPT-4o Vision으로 레퍼런스 이미지 스타일 분석
     */
    public CustomIconResponse.StyleAnalysis analyzeStyle(String base64Image) {
        validateApiKey();

        String systemPrompt = """
                You are an icon style analyzer. Analyze the given icon image and extract its visual style specification.
                Respond ONLY with a JSON object (no markdown, no explanation) with these fields:
                {
                  "style": "line" or "solid" or "duotone",
                  "stroke_weight": "thin" or "light" or "medium" or "bold",
                  "corner_radius": "sharp" or "slightly-rounded" or "rounded" or "fully-rounded",
                  "fill": "none" or "partial" or "full",
                  "detail": "minimal" or "moderate" or "detailed",
                  "padding_ratio": 0.10 to 0.25 (number)
                }
                """;

        String userPrompt = "Analyze this icon's visual style and return the style specification JSON.";

        try {
            // GPT-4o Vision 요청 (image_url 방식)
            Map<String, Object> requestBody = Map.of(
                    "model", visionModel,
                    "max_tokens", 500,
                    "messages", List.of(
                            Map.of("role", "system", "content", systemPrompt),
                            Map.of("role", "user", "content", List.of(
                                    Map.of("type", "text", "text", userPrompt),
                                    Map.of("type", "image_url", "image_url",
                                            Map.of("url", "data:image/png;base64," + base64Image))
                            ))
                    )
            );

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            log.info("Calling OpenAI Vision API for style analysis, model: {}", visionModel);

            ResponseEntity<Map> response = aiRestTemplate.postForEntity(OPENAI_CHAT_URL, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return parseStyleAnalysis(response.getBody());
            }

            throw new BusinessException(ErrorCode.CUSTOMICON_STYLE_ANALYSIS_FAILED);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Style analysis failed: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.CUSTOMICON_STYLE_ANALYSIS_FAILED);
        }
    }

    /**
     * OpenAI Images API로 아이콘 스프라이트 시트 생성
     */
    public byte[] generateSpriteSheet(String prompt) {
        validateApiKey();

        try {
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", imageModel);
            requestBody.put("prompt", prompt);
            requestBody.put("n", 1);
            requestBody.put("size", imageSize);
            requestBody.put("response_format", "b64_json");

            if ("dall-e-3".equals(imageModel)) {
                requestBody.put("quality", "standard");
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            log.info("Calling OpenAI Images API for sprite sheet generation, model: {}", imageModel);

            ResponseEntity<Map> response = aiRestTemplate.postForEntity(OPENAI_IMAGES_URL, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return extractImageBytes(response.getBody());
            }

            throw new BusinessException(ErrorCode.CUSTOMICON_GENERATION_FAILED);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Sprite sheet generation failed: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.CUSTOMICON_GENERATION_FAILED);
        }
    }

    private void validateApiKey() {
        if (apiKey == null || apiKey.isBlank()) {
            throw new BusinessException(ErrorCode.AI_SERVICE_UNAVAILABLE);
        }
    }

    @SuppressWarnings("unchecked")
    private CustomIconResponse.StyleAnalysis parseStyleAnalysis(Map<String, Object> responseBody) {
        try {
            List<Map<String, Object>> choices = (List<Map<String, Object>>) responseBody.get("choices");
            if (choices == null || choices.isEmpty()) {
                throw new BusinessException(ErrorCode.CUSTOMICON_STYLE_ANALYSIS_FAILED);
            }

            Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
            String content = (String) message.get("content");

            // JSON 추출 (GPT 응답에서 순수 JSON만 추출)
            String json = extractJson(content);
            log.debug("Style analysis raw content: {}", content);

            Map<String, Object> styleMap = objectMapper.readValue(json, Map.class);

            return CustomIconResponse.StyleAnalysis.builder()
                    .style((String) styleMap.getOrDefault("style", "line"))
                    .strokeWeight((String) styleMap.getOrDefault("stroke_weight", "medium"))
                    .cornerRadius((String) styleMap.getOrDefault("corner_radius", "rounded"))
                    .fill((String) styleMap.getOrDefault("fill", "none"))
                    .detail((String) styleMap.getOrDefault("detail", "minimal"))
                    .paddingRatio(((Number) styleMap.getOrDefault("padding_ratio", 0.15)).doubleValue())
                    .build();

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to parse style analysis response: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.CUSTOMICON_STYLE_ANALYSIS_FAILED);
        }
    }

    @SuppressWarnings("unchecked")
    private byte[] extractImageBytes(Map<String, Object> responseBody) {
        try {
            List<Map<String, Object>> data = (List<Map<String, Object>>) responseBody.get("data");
            if (data == null || data.isEmpty()) {
                throw new BusinessException(ErrorCode.CUSTOMICON_GENERATION_FAILED);
            }

            String b64Json = (String) data.get(0).get("b64_json");
            if (b64Json == null) {
                throw new BusinessException(ErrorCode.CUSTOMICON_GENERATION_FAILED);
            }

            return Base64.getDecoder().decode(b64Json);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to extract image from response: {}", e.getMessage());
            throw new BusinessException(ErrorCode.CUSTOMICON_GENERATION_FAILED);
        }
    }

    /**
     * GPT 응답에서 JSON 객체만 추출
     * - ```json ... ``` 코드블록
     * - ``` ... ``` 코드블록
     * - 텍스트 중간에 있는 { ... } JSON
     * - 순수 JSON 문자열
     */
    private String extractJson(String content) {
        if (content == null || content.isBlank()) {
            return "{}";
        }
        content = content.trim();

        // 코드블록 내 JSON 추출: ```json ... ``` 또는 ``` ... ```
        java.util.regex.Matcher codeBlock = java.util.regex.Pattern
                .compile("```(?:json)?\\s*(\\{.*?})\\s*```", java.util.regex.Pattern.DOTALL)
                .matcher(content);
        if (codeBlock.find()) {
            return codeBlock.group(1).trim();
        }

        // 첫 번째 { ... } 추출
        int start = content.indexOf('{');
        int end = content.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return content.substring(start, end + 1);
        }

        // 그대로 반환 (파싱 시도)
        return content;
    }
}
