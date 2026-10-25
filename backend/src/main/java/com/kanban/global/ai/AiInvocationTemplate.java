package com.kanban.global.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.CreditConsumption;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.domain.system.MonetizationService;
import com.kanban.global.config.AIProvider;
import com.kanban.global.config.AIResponse;
import java.util.function.Function;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * LLM 호출의 공통 뼈대 — <b>트랜잭션 밖에서</b> 프로바이더를 부른다.
 *
 * <p>예전에는 각 AI 서비스가 {@code @Transactional} 메서드 안에서 크레딧 차감 → 프롬프트 조립 →
 * 프로바이더 호출(읽기 타임아웃 60초) → 사용량 로그 → 파싱을 한 번에 했다. 그러면 LLM 왕복 내내
 * DB 커넥션(prod 풀 20개)과 구독 행의 비관적 락을 쥐고 있게 된다. 이 템플릿은 그 순서를 지키되
 * 각 DB 작업을 짧은 트랜잭션으로 쪼갠다.
 *
 * <ol>
 *   <li>크레딧 차감 — {@link AiCreditService#consumeCredit}의 자체 {@code @Transactional}로 짧게 커밋</li>
 *   <li>프로바이더 호출 — 트랜잭션 없음</li>
 *   <li>사용량 로그 — {@code REQUIRES_NEW} 트랜잭션으로 짧게 커밋 (실패해도 결과에는 영향 없음)</li>
 *   <li>{@code parse} 적용</li>
 * </ol>
 *
 * <p>2·4단계가 실패하면 차감한 크레딧을 돌려준다({@link AiInvocationRequest#keepCreditOnFailure}가
 * false일 때). 예전 구조에서 같은 트랜잭션이 롤백되며 차감이 없던 일이 되던 것과 API 관점에서 같다.
 *
 * <p>호출부 규칙: 이 메서드는 <b>활성 트랜잭션이 없는 곳</b>에서 불러야 한다. 프롬프트에 들어갈 값은
 * 호출 전에 트랜잭션 안에서 읽어 문자열로 바꿔 둔다(OSIV off — LAZY 연관은 트랜잭션 밖에서 터진다).
 */
@Slf4j
@Component
public class AiInvocationTemplate {

    private final AIProvider aiProvider;
    private final AiCreditService aiCreditService;
    private final MonetizationService monetizationService;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate usageLogTransaction;
    private final String provider;

    public AiInvocationTemplate(
            AIProvider aiProvider,
            AiCreditService aiCreditService,
            MonetizationService monetizationService,
            AiUsageLogRepository aiUsageLogRepository,
            ObjectMapper objectMapper,
            PlatformTransactionManager transactionManager,
            @Value("${ai.provider:claude}") String provider) {
        this.aiProvider = aiProvider;
        this.aiCreditService = aiCreditService;
        this.monetizationService = monetizationService;
        this.aiUsageLogRepository = aiUsageLogRepository;
        this.objectMapper = objectMapper;
        this.provider = provider;
        this.usageLogTransaction = new TransactionTemplate(transactionManager);
        this.usageLogTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * 크레딧 차감 → AI 호출 → 사용량 로그 → {@code parse}.
     *
     * @param parse 응답 본문(문자열)을 결과 타입으로 바꾸는 함수. 여기서 던진 예외도 "실패"로 보고 크레딧을 환불한다.
     *              DB를 건드리지 말 것 — 트랜잭션 밖에서 실행된다.
     */
    public <T> T invoke(AiInvocationRequest request, Function<String, T> parse) {
        Invocation invocation = execute(request);
        try {
            return parse.apply(invocation.response().content());
        } catch (RuntimeException e) {
            refundIfConsumed(request, invocation.consumed(), "parse failed: " + e.getMessage());
            throw e;
        }
    }

    /**
     * 크레딧 차감 → AI 호출 → 사용량 로그. 파싱 없이 원본 응답이 필요할 때 쓴다.
     */
    public AIResponse chat(AiInvocationRequest request) {
        return execute(request).response();
    }

    /** 응답과 함께 "이번 호출이 실제로 어디서 얼마나 차감했는지"를 들고 다닌다 — 환불은 그 기록대로 되돌린다. */
    private record Invocation(AIResponse response, CreditConsumption consumed) {}

    private Invocation execute(AiInvocationRequest request) {
        warnIfTransactionActive(request);

        // 1. 크레딧 — AiCreditService의 @Transactional이 자체 트랜잭션을 연다(활성 트랜잭션이 없으므로 REQUIRED = 새로 시작).
        //    부족하면 여기서 AI_CREDITS_EXHAUSTED 등이 나가고 AI는 호출되지 않는다.
        CreditConsumption consumed = CreditConsumption.NONE;
        if (request.consumesCredit()) {
            if (request.creditScope() == AiInvocationRequest.CreditScope.USER) {
                aiCreditService.consumeUserCredit(request.userId(), request.featureType(), request.creditCost());
                consumed = CreditConsumption.monthly(request.creditCost());
            } else {
                consumed = aiCreditService.consumeCredit(
                        request.boardId(), request.userId(), request.featureType(), request.creditCost());
            }
        }

        // 2. 프로바이더 — 트랜잭션 없음
        AIResponse response;
        try {
            response = aiProvider.chatWithUsage(
                    request.systemPrompt(),
                    request.userPrompt(),
                    request.model(),
                    request.maxTokens(),
                    request.temperature());
        } catch (RuntimeException e) {
            refundIfConsumed(request, consumed, "provider call failed: " + e.getMessage());
            throw e;
        }

        // 3. 사용량 로그 — 토큰은 이미 썼으니 파싱 성패와 무관하게 남긴다
        recordUsage(request, response);
        return new Invocation(response, consumed);
    }

    private void recordUsage(AiInvocationRequest request, AIResponse response) {
        String model = response.model() != null ? response.model() : request.model();
        try {
            usageLogTransaction.executeWithoutResult(status -> aiUsageLogRepository.save(AiUsageLog.builder()
                    .boardId(request.boardId())
                    .userId(request.userId())
                    .featureType(request.featureType())
                    .provider(provider.toUpperCase())
                    .model(model)
                    .inputTokens(response.inputTokens())
                    .outputTokens(response.outputTokens())
                    .creditsUsed(request.creditCost() > 0 ? request.creditCost() : 1)
                    .estimatedCostUsd(AiUsageLog.calculateCost(model, response.inputTokens(), response.outputTokens()))
                    .build()));
        } catch (Exception e) {
            log.debug("Failed to save AI usage log: {}", e.getMessage());
        }
    }

    private void refundIfConsumed(AiInvocationRequest request, CreditConsumption consumed, String reason) {
        if (!request.consumesCredit() || request.keepCreditOnFailure()) {
            return;
        }
        // 수익화 off면 consumeCredit이 아무것도 차감하지 않았다(NONE) — 돌려줄 것도 없다
        if (!monetizationService.isMonetizationEnabled() || consumed == null || consumed.isEmpty()) {
            return;
        }
        try {
            if (request.creditScope() == AiInvocationRequest.CreditScope.USER) {
                aiCreditService.refundUserCredit(request.userId(), request.featureType(), consumed.total());
            } else {
                aiCreditService.refundCredit(request.boardId(), request.userId(), request.featureType(), consumed);
            }
            log.info(
                    "AI credit refunded after failure - board: {}, feature: {}, monthly: {}, purchased: {}, reason: {}",
                    request.boardId(),
                    request.featureType(),
                    consumed.monthlyUsed(),
                    consumed.purchasedUsed(),
                    reason);
        } catch (Exception e) {
            // 원래 예외를 가리지 않는다 — 환불 실패는 기록만
            log.warn(
                    "AI credit refund failed - board: {}, feature: {}, error: {}",
                    request.boardId(),
                    request.featureType(),
                    e.getMessage());
        }
    }

    private void warnIfTransactionActive(AiInvocationRequest request) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            // 설계 위반이지만 동작은 시킨다 — 발견하는 즉시 호출부를 고칠 것
            log.warn(
                    "AiInvocationTemplate called inside an active transaction - feature: {}, board: {}. "
                            + "The DB connection will be held for the whole LLM round-trip.",
                    request.featureType(),
                    request.boardId());
        }
    }

    // ===== JSON helpers (shared by all AI services) =====

    /**
     * {@link #extractJson}으로 본문만 도려낸 뒤 트리로 읽는다.
     */
    public JsonNode readJsonTree(String aiResponse) throws JsonProcessingException {
        return objectMapper.readTree(extractJson(aiResponse));
    }

    /**
     * 모델 응답에서 JSON 객체 본문만 꺼낸다.
     *
     * <ul>
     *   <li>{@code ```json ... ```} / {@code ``` ... ```} 코드펜스를 벗긴다</li>
     *   <li>앞뒤에 설명 문장이 붙어 있어도 첫 {@code '{'}부터 마지막 {@code '}'}까지만 남긴다</li>
     *   <li>토큰 상한에 걸려 닫는 괄호가 없으면 열린 괄호·배열을 닫아 복구를 시도한다</li>
     *   <li>{@code null}이면 {@code "{}"}</li>
     * </ul>
     */
    public static String extractJson(String response) {
        if (response == null) return "{}";
        String trimmed = response.trim();

        // Strip markdown code fences if present
        if (trimmed.startsWith("```")) {
            int firstNewline = trimmed.indexOf('\n');
            int lastFence = trimmed.lastIndexOf("```");
            if (firstNewline > 0 && lastFence > firstNewline) {
                trimmed = trimmed.substring(firstNewline + 1, lastFence).trim();
            }
        }

        // Find first { and last }
        int start = trimmed.indexOf('{');
        int end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return trimmed.substring(start, end + 1);
        }

        // Truncated JSON recovery: close unclosed brackets/braces
        if (start >= 0) {
            String partial = trimmed.substring(start);
            log.warn("Attempting truncated JSON recovery ({} chars)", partial.length());
            return repairTruncatedJson(partial);
        }

        return trimmed;
    }

    /**
     * 토큰 제한으로 잘린 JSON을 복구: 마지막 완전한 토큰까지 자른 뒤 열린 괄호/배열을 닫아준다.
     */
    static String repairTruncatedJson(String json) {
        int lastComplete = -1;
        for (int i = json.length() - 1; i >= 0; i--) {
            char c = json.charAt(i);
            if (c == ',' || c == '{' || c == '[' || c == ':' || c == '"' || c == '}' || c == ']') {
                lastComplete = i;
                break;
            }
        }
        if (lastComplete > 0) {
            char lastChar = json.charAt(lastComplete);
            if (lastChar == ',' || lastChar == ':') {
                json = json.substring(0, lastComplete);
            } else {
                json = json.substring(0, lastComplete + 1);
            }
        }

        int braces = 0, brackets = 0;
        boolean inString = false;
        for (int i = 0; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '\\' && inString) {
                i++;
                continue;
            }
            if (c == '"') {
                inString = !inString;
                continue;
            }
            if (inString) continue;
            if (c == '{') braces++;
            else if (c == '}') braces--;
            else if (c == '[') brackets++;
            else if (c == ']') brackets--;
        }

        StringBuilder sb = new StringBuilder(json);
        while (brackets > 0) {
            sb.append(']');
            brackets--;
        }
        while (braces > 0) {
            sb.append('}');
            braces--;
        }
        return sb.toString();
    }
}
