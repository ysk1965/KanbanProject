package com.kanban.domain.ai.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.ai.dto.CommitPlanRequest;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.global.config.ClaudeAIProvider;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * MILKYWAY 커밋 플랜 생성 — <b>목적 고정</b> AI 프록시.
 *
 * <p>프롬프트·모델·max_tokens·출력 스키마를 전부 서버가 강제한다. 범용 프롬프트 실행 경로가
 * 없으므로, 엔드포인트가 유출돼도 피해 상한은 "커밋 플랜 생성"이다.
 *
 * <p>{@code ai.provider} 값과 무관하게 항상 Claude로 간다 — {@link ClaudeAIProvider}를 구체 타입으로
 * 주입하기 때문이다. 범용 {@code AIProvider}를 쓰면 provider=openai 환경에서 OpenAI가 조용히 호출된다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CommitPlanService {

    /** 서버가 강제하는 출력 토큰 상한. */
    private static final int MAX_TOKENS = 4096;

    /** 입력 필드별 절단 길이. 프롬프트 폭탄으로 비용이 튀는 걸 막는다. */
    private static final int INPUT_CLIP = 40_000;

    private static final String FEATURE_TYPE = "COMMIT_PLAN";

    private final ClaudeAIProvider claudeAIProvider;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final ObjectMapper objectMapper;

    @Value("${ai.claude.model.commit-plan:claude-opus-4-8}")
    private String model;

    /** 출력 JSON 스키마. Anthropic structured outputs로 강제되므로 파싱 실패가 없다. */
    private static final Map<String, Object> OUTPUT_SCHEMA = Map.of(
            "type", "object",
            "additionalProperties", false,
            "required", List.of("commits", "unmapped"),
            "properties", Map.of(
                    "commits", Map.of(
                            "type", "array",
                            "items", Map.of(
                                    "type", "object",
                                    "additionalProperties", false,
                                    "required", List.of("files", "type", "scope", "subject", "body"),
                                    "properties", Map.of(
                                            "files", Map.of("type", "array", "items", Map.of("type", "string")),
                                            "type", Map.of("type", "string"),
                                            "scope", Map.of("type", "string"),
                                            "subject", Map.of("type", "string"),
                                            "body", Map.of("type", "string")
                                    )
                            )
                    ),
                    "unmapped", Map.of("type", "array", "items", Map.of("type", "string"))
            )
    );

    private static final String SYSTEM_PROMPT_TEMPLATE = """
            너는 Unity 게임 프로젝트의 커밋 플랜 도우미다. 변경 파일의 1차 그룹(경로 기반 결정론 분할)과 diff를 보고,
            MILKYWAY 규칙에 맞는 커밋 플랜(커밋 목록 + 각 커밋 메시지 초안)을 만든다.

            그룹 규칙:
            - 입력 groups의 구조 분할을 기본으로 존중한다. 같은 그룹 안에서 diff상 명백히 다른 기능이 섞여 있으면 커밋을 나눈다
            - 서로 다른 scope 그룹을 하나의 커밋으로 합치지 않는다 (단, 한 기능의 코드+메타/에셋처럼 명백히 한 몸이면 예외)
            - unmapped 파일은 diff로 소속이 명백할 때만 커밋에 넣고, 아니면 unmapped로 돌려보낸다
            - 모든 입력 파일은 정확히 한 곳(commits 중 하나 또는 unmapped)에 있어야 한다

            메시지 규칙:
            - subject는 반드시 도메인 명사로 시작한다. 수정/개선/추가/변경/삭제/적용/구현/fix/update/add 같은 동사로 시작 금지
            - scope는 아래 사전에 있는 것만 사용한다
            - 기능(로직) 변경에는 chore/ci/build/deps를 쓰지 않는다
            - body는 1~2줄, 한국어, 무엇이 왜 바뀌었는지

            scope 사전:
            %s
            """;

    /**
     * 커밋 플랜을 생성한다.
     *
     * @param userId 사용량 로그에 남길 호출자. 인증 없이 열어둔 경우 {@code null}
     * @return 출력 스키마를 만족하는 JSON ({@code commits}, {@code unmapped})
     */
    public JsonNode generate(CommitPlanRequest request, String userId) {
        if (request.getGroups() == null || request.getGroups().isEmpty()) {
            throw new BusinessException(ErrorCode.COMMIT_PLAN_GROUPS_REQUIRED);
        }

        String systemPrompt = SYSTEM_PROMPT_TEMPLATE.formatted(clip(request.getScopes()));
        String userPrompt = buildUserPrompt(request);

        ClaudeAIProvider.StructuredResponse response =
                claudeAIProvider.chatStructured(systemPrompt, userPrompt, model, MAX_TOKENS, OUTPUT_SCHEMA);

        // 사용량은 성공/실패 판정 전에 남긴다 — 토큰은 이미 소비됐다
        recordUsage(userId, response);

        if ("refusal".equals(response.stopReason())) {
            throw new BusinessException(ErrorCode.COMMIT_PLAN_REFUSED);
        }
        if ("max_tokens".equals(response.stopReason())) {
            throw new BusinessException(ErrorCode.COMMIT_PLAN_TRUNCATED);
        }
        if (response.json() == null || response.json().isBlank()) {
            log.error("Claude returned empty content for commit plan (stop_reason={})", response.stopReason());
            throw new BusinessException(ErrorCode.COMMIT_PLAN_MALFORMED);
        }

        try {
            return objectMapper.readTree(response.json());
        } catch (Exception e) {
            // structured outputs가 보장하므로 정상적으로는 도달하지 않는다
            log.error("Failed to parse commit plan JSON: {}", e.getMessage());
            throw new BusinessException(ErrorCode.COMMIT_PLAN_MALFORMED);
        }
    }

    /** 스펙에 명시된 유저 메시지 구성. */
    private String buildUserPrompt(CommitPlanRequest request) {
        StringBuilder sb = new StringBuilder();
        sb.append("1차 그룹 (경로 기반 결정론 분할):\n");
        for (CommitPlanRequest.Group group : request.getGroups()) {
            sb.append('[').append(group.getScope()).append("]\n");
            if (group.getFiles() != null) {
                group.getFiles().forEach(file -> sb.append(file).append('\n'));
            }
        }

        sb.append("\n미분류 파일:\n");
        List<String> unmapped = request.getUnmapped();
        if (unmapped == null || unmapped.isEmpty()) {
            sb.append("(없음)\n");
        } else {
            unmapped.forEach(file -> sb.append(file).append('\n'));
        }

        sb.append("\ndiff 요약:\n").append(clip(request.getDiff()));

        // 그룹 목록이 비대해진 경우까지 포함해 전체를 한 번 더 절단한다
        return clip(sb.toString());
    }

    private String clip(String value) {
        if (value == null) return "";
        return value.length() <= INPUT_CLIP ? value : value.substring(0, INPUT_CLIP);
    }

    /**
     * 사용량 기록. 보드 컨텍스트가 없는 호출이라 {@code boardId}는 항상 null이고 크레딧 차감도 하지 않는다.
     * 비용 가시성 확보가 목적이다.
     */
    private void recordUsage(String userId, ClaudeAIProvider.StructuredResponse response) {
        try {
            aiUsageLogRepository.save(AiUsageLog.builder()
                    .userId(userId)
                    .featureType(FEATURE_TYPE)
                    .provider("claude")
                    .model(response.model())
                    .inputTokens(response.inputTokens())
                    .outputTokens(response.outputTokens())
                    .estimatedCostUsd(AiUsageLog.calculateCost(
                            response.model(), response.inputTokens(), response.outputTokens()))
                    .creditsUsed(0)
                    .build());
        } catch (Exception e) {
            // 로깅 실패가 응답을 막아서는 안 된다
            log.error("Failed to record commit plan usage: {}", e.getMessage());
        }
    }
}
