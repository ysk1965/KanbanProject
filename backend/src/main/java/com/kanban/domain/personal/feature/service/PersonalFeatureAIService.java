package com.kanban.domain.personal.feature.service;

import com.kanban.domain.personal.feature.dto.PersonalFeatureAIResponse;
import com.kanban.global.ai.AiInvocationRequest;
import com.kanban.global.ai.AiInvocationTemplate;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 마이 스페이스 기능 문서의 AI 보조 — 지금은 설교 노트의 「문장 정리」 하나.
 *
 * <p>개인 크레딧({@link AiInvocationRequest.CreditScope#USER})을 1 차감한다. 트랜잭션 밖에서 호출된다
 * ({@link AiInvocationTemplate} 규칙) — 여기서는 DB 를 읽지 않으므로 {@code @Transactional} 을 붙이지 않는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PersonalFeatureAIService {

    private static final String FEATURE_TYPE = "PERSONAL_POLISH";
    private static final int MAX_TOKENS = 1024;

    private final AiInvocationTemplate aiInvocationTemplate;

    @Value("${ai.provider:claude}")
    private String provider;

    @Value("${ai.claude.model.personal:claude-haiku-4-5-20251001}")
    private String claudeModel;

    @Value("${ai.openai.model.personal:gpt-4o-mini}")
    private String openaiModel;

    public PersonalFeatureAIResponse.Polish polish(String userId, String featureKey, String text) {
        if (featureKey == null || !PersonalFeatureDocService.FEATURE_KEYS.contains(featureKey)) {
            throw new BusinessException(ErrorCode.PERSONAL_FEATURE_UNKNOWN);
        }
        String source = text == null ? "" : text.strip();
        if (source.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        AiInvocationRequest request = AiInvocationRequest.builder()
                .userId(userId)
                .featureType(FEATURE_TYPE)
                .creditScope(AiInvocationRequest.CreditScope.USER)
                .creditCost(1)
                .systemPrompt(systemPrompt(featureKey))
                .userPrompt(source)
                .model("openai".equals(provider) ? openaiModel : claudeModel)
                .maxTokens(MAX_TOKENS)
                .temperature(0.2)
                .build();
        String polished = aiInvocationTemplate.invoke(request, PersonalFeatureAIService::clean);
        if (polished.isEmpty()) polished = source;
        return new PersonalFeatureAIResponse.Polish(polished);
    }

    private static String systemPrompt(String featureKey) {
        String context = PersonalFeatureTermService.FEATURE_SERMON.equals(featureKey)
                ? "The text is a passage from a personal sermon note, typed quickly while listening to a sermon in church."
                : "The text is a passage from a personal note, typed quickly.";
        return """
                You tidy up hastily typed notes. %s

                <rules>
                - Fix typos, spacing and particles; join fragments into complete, natural sentences
                - Keep every idea, name, number and Bible reference exactly as written. Add nothing, drop nothing
                - Keep the original language, tone and politeness level (plain Korean stays plain, 존댓말 stays 존댓말)
                - Keep roughly the same length and the same line breaks. One input line → one output line
                - Do not add headings, bullets, quotes, emoji or commentary
                - Respond with the tidied text only — no preface, no explanation, no code fences
                </rules>
                """.formatted(context);
    }

    /** 모델이 덧붙인 코드펜스·따옴표만 벗긴다 */
    static String clean(String content) {
        if (content == null) return "";
        String t = content.strip();
        if (t.startsWith("```")) {
            int nl = t.indexOf('\n');
            t = nl >= 0 ? t.substring(nl + 1) : "";
            if (t.endsWith("```")) t = t.substring(0, t.length() - 3);
            t = t.strip();
        }
        if (t.length() >= 2
                && t.startsWith("\"")
                && t.endsWith("\"")
                && !t.substring(1, t.length() - 1).contains("\"")) {
            t = t.substring(1, t.length() - 1).strip();
        }
        return t;
    }
}
