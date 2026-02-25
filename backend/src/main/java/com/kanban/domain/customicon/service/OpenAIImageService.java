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

import org.springframework.core.io.ByteArrayResource;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import java.util.*;

@Slf4j
@Service
public class OpenAIImageService {

    private static final String OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
    private static final String OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
    private static final String OPENAI_IMAGES_EDIT_URL = "https://api.openai.com/v1/images/edits";

    private final RestTemplate aiRestTemplate;
    private final ObjectMapper objectMapper;

    @Value("${ai.openai.api-key:}")
    private String apiKey;

    @Value("${app.customicon.vision-model:gpt-4o}")
    private String visionModel;

    @Value("${app.customicon.image-model:gpt-image-1}")
    private String imageModel;

    @Value("${app.customicon.image-size:1024x1024}")
    private String imageSize;

    public OpenAIImageService(@Qualifier("aiRestTemplate") RestTemplate aiRestTemplate,
                              ObjectMapper objectMapper) {
        this.aiRestTemplate = aiRestTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * GPT-4o Vision으로 레퍼런스 이미지의 스타일 분석
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
            log.info("OpenAI Vision API 스타일 분석 호출, 모델: {}", visionModel);

            ResponseEntity<Map> response = aiRestTemplate.postForEntity(OPENAI_CHAT_URL, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return parseStyleAnalysis(response.getBody());
            }

            throw new BusinessException(ErrorCode.CUSTOMICON_STYLE_ANALYSIS_FAILED);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("스타일 분석 실패: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.CUSTOMICON_STYLE_ANALYSIS_FAILED);
        }
    }

    /**
     * OpenAI Images API로 아이콘 스프라이트 시트 생성 (텍스트 프롬프트만)
     */
    public byte[] generateSpriteSheet(String prompt) {
        validateApiKey();

        try {
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", imageModel);
            requestBody.put("prompt", prompt);
            requestBody.put("n", 1);
            requestBody.put("size", imageSize);

            // gpt-image-1과 dall-e-3의 파라미터 차이 처리
            if (imageModel.startsWith("gpt-image")) {
                requestBody.put("output_format", "png");
                requestBody.put("quality", "medium");
            } else {
                requestBody.put("response_format", "b64_json");
                if ("dall-e-3".equals(imageModel)) {
                    requestBody.put("quality", "standard");
                }
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            log.info("OpenAI Images API 스프라이트 시트 생성 호출, 모델: {}", imageModel);

            ResponseEntity<Map> response = aiRestTemplate.postForEntity(OPENAI_IMAGES_URL, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return extractImageBytes(response.getBody());
            }

            throw new BusinessException(ErrorCode.CUSTOMICON_GENERATION_FAILED);

        } catch (BusinessException e) {
            throw e;
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            log.error("스프라이트 시트 생성 실패 - HTTP {}: {}", e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new BusinessException(ErrorCode.CUSTOMICON_GENERATION_FAILED);
        } catch (Exception e) {
            log.error("스프라이트 시트 생성 실패: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.CUSTOMICON_GENERATION_FAILED);
        }
    }

    /**
     * OpenAI Images Edit API로 레퍼런스 이미지 기반 스프라이트 시트 생성
     */
    public byte[] generateSpriteSheet(String prompt, byte[] referenceImage) {
        validateApiKey();

        try {
            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();

            // gpt-image-1은 image[] (배열), dall-e-2는 image (단일)
            String imageFieldName = imageModel.startsWith("gpt-image") ? "image[]" : "image";
            body.add(imageFieldName, new ByteArrayResource(referenceImage) {
                @Override
                public String getFilename() {
                    return "reference.png";
                }
            });
            body.add("prompt", prompt);
            body.add("model", imageModel);
            body.add("size", imageSize);
            body.add("n", "1");

            if (imageModel.startsWith("gpt-image")) {
                body.add("output_format", "png");
                body.add("quality", "medium");
            } else {
                body.add("response_format", "b64_json");
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);
            headers.setBearerAuth(apiKey);

            HttpEntity<MultiValueMap<String, Object>> entity = new HttpEntity<>(body, headers);
            log.info("OpenAI Images Edit API 스프라이트 시트 생성 호출 (레퍼런스 이미지 포함), 모델: {}", imageModel);

            ResponseEntity<Map> response = aiRestTemplate.postForEntity(OPENAI_IMAGES_EDIT_URL, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return extractImageBytes(response.getBody());
            }

            throw new BusinessException(ErrorCode.CUSTOMICON_GENERATION_FAILED);

        } catch (BusinessException e) {
            throw e;
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            log.error("레퍼런스 기반 스프라이트 시트 생성 실패 - HTTP {}: {}", e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new BusinessException(ErrorCode.CUSTOMICON_GENERATION_FAILED);
        } catch (Exception e) {
            log.error("레퍼런스 기반 스프라이트 시트 생성 실패: {}", e.getMessage(), e);
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
        String rawContent = null;
        try {
            List<Map<String, Object>> choices = (List<Map<String, Object>>) responseBody.get("choices");
            if (choices == null || choices.isEmpty()) {
                log.error("스타일 분석: 응답에 choices 없음. 키: {}", responseBody.keySet());
                throw new BusinessException(ErrorCode.CUSTOMICON_STYLE_ANALYSIS_FAILED);
            }

            Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
            if (message == null) {
            log.error("스타일 분석: message가 null. Choice 키: {}", choices.get(0).keySet());
                throw new BusinessException(ErrorCode.CUSTOMICON_STYLE_ANALYSIS_FAILED);
            }

            Object contentObj = message.get("content");
            if (contentObj == null) {
                // content가 null인 경우 (refusal 등) → 기본값 반환
                log.warn("스타일 분석: content가 null, message 키: {}. 기본값 사용.", message.keySet());
                return buildDefaultStyleAnalysis();
            }

            // content가 String이 아닌 경우 (배열 형태) 처리
            if (contentObj instanceof String) {
                rawContent = (String) contentObj;
            } else if (contentObj instanceof List) {
                // 배열 형태 content에서 text 추출
                List<Map<String, Object>> contentList = (List<Map<String, Object>>) contentObj;
                for (Map<String, Object> c : contentList) {
                    if ("text".equals(c.get("type"))) {
                        rawContent = String.valueOf(c.get("text"));
                        break;
                    }
                }
            } else {
                rawContent = String.valueOf(contentObj);
            }

            if (rawContent == null || rawContent.isBlank()) {
                log.warn("스타일 분석: 빈 content. 기본값 사용.");
                return buildDefaultStyleAnalysis();
            }

            log.info("스타일 분석 원본 응답: {}", rawContent);

            // GPT 응답에서 순수 JSON만 추출
            String json = extractJson(rawContent);

            // SNAKE_CASE 전략의 영향을 받지 않는 별도 ObjectMapper 사용
            ObjectMapper plainMapper = new ObjectMapper();
            Map<String, Object> styleMap = plainMapper.readValue(json, Map.class);

            return CustomIconResponse.StyleAnalysis.builder()
                    .style(getStringOrDefault(styleMap, "style", "line"))
                    .strokeWeight(getStringOrDefault(styleMap, "stroke_weight", "medium"))
                    .cornerRadius(getStringOrDefault(styleMap, "corner_radius", "rounded"))
                    .fill(getStringOrDefault(styleMap, "fill", "none"))
                    .detail(getStringOrDefault(styleMap, "detail", "minimal"))
                    .paddingRatio(getDoubleOrDefault(styleMap, "padding_ratio", 0.15))
                    .build();

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("스타일 분석 응답 파싱 실패. rawContent=[{}], error={}", rawContent, e.getMessage(), e);
            // 파싱 실패 시 기본값 반환 (OpenAI 응답 형식 변동 대응)
            return buildDefaultStyleAnalysis();
        }
    }

    private CustomIconResponse.StyleAnalysis buildDefaultStyleAnalysis() {
        return CustomIconResponse.StyleAnalysis.builder()
                .style("line")
                .strokeWeight("medium")
                .cornerRadius("rounded")
                .fill("none")
                .detail("minimal")
                .paddingRatio(0.15)
                .build();
    }

    private String getStringOrDefault(Map<String, Object> map, String key, String defaultValue) {
        Object val = map.get(key);
        return val != null ? String.valueOf(val) : defaultValue;
    }

    private double getDoubleOrDefault(Map<String, Object> map, String key, double defaultValue) {
        Object val = map.get(key);
        if (val instanceof Number) {
            return ((Number) val).doubleValue();
        }
        if (val instanceof String) {
            try {
                return Double.parseDouble((String) val);
            } catch (NumberFormatException e) {
                return defaultValue;
            }
        }
        return defaultValue;
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
            log.error("응답에서 이미지 추출 실패: {}", e.getMessage());
            throw new BusinessException(ErrorCode.CUSTOMICON_GENERATION_FAILED);
        }
    }

    /**
     * GPT 응답에서 JSON 객체만 추출 (코드블록, 텍스트 내 JSON, 순수 JSON 지원)
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
