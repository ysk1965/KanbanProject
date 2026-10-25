package com.kanban.global.ai;

import lombok.Builder;

/**
 * {@link AiInvocationTemplate#invoke} 한 번에 필요한 모든 입력.
 *
 * <p>프롬프트·모델 같은 <b>순수 값</b>만 담는다. 엔티티를 넣지 말 것 — 템플릿은 트랜잭션 밖에서
 * 돌기 때문에 LAZY 연관을 건드리면 {@code LazyInitializationException}이 난다. 호출부가 트랜잭션
 * 안에서 읽어 문자열로 바꿔 넘겨야 한다.
 *
 * @param boardId             사용량 로그·크레딧 차감 대상 보드 (시스템 호출이면 null 가능)
 * @param userId              사용량 로그·크레딧 차감 대상 사용자 (스케줄러 호출이면 null 가능)
 * @param featureType         사용량 로그의 feature_type (예: {@code "MEETING"}, {@code "REPORT_TEAM"})
 * @param creditScope         크레딧을 어디서 차감할지. {@code null}이면 creditCost&gt;0일 때 BOARD, 아니면 NONE
 * @param creditCost          차감할 크레딧 수. 0 이하면 차감하지 않는다
 * @param keepCreditOnFailure true면 AI 호출·파싱이 실패해도 크레딧을 돌려주지 않는다. 기본(false)은 환불 —
 *                            예전처럼 @Transactional 안에서 호출이 실패하면 차감까지 롤백되던 동작과 같다
 * @param systemPrompt        시스템 프롬프트
 * @param userPrompt          사용자 프롬프트
 * @param model               모델 id
 * @param maxTokens           최대 출력 토큰
 * @param temperature         temperature. {@code null}이면 프로바이더 기본값
 */
@Builder
public record AiInvocationRequest(
        String boardId,
        String userId,
        String featureType,
        CreditScope creditScope,
        int creditCost,
        boolean keepCreditOnFailure,
        String systemPrompt,
        String userPrompt,
        String model,
        int maxTokens,
        Double temperature) {

    public enum CreditScope {
        /** {@code AiCreditService.consumeCredit(boardId, ...)} — 보드(또는 보드가 속한 조직) 크레딧 풀 */
        BOARD,
        /** {@code AiCreditService.consumeUserCredit(userId, ...)} — 개인 크레딧 (마이스페이스 기능) */
        USER,
        /** 차감 없음 — 시스템 호출, 또는 호출부가 직접 차감/환불을 관리하는 경우 */
        NONE
    }

    public AiInvocationRequest {
        if (featureType == null || featureType.isBlank()) {
            throw new IllegalArgumentException("featureType is required");
        }
        if (model == null || model.isBlank()) {
            throw new IllegalArgumentException("model is required");
        }
        if (creditScope == null) {
            creditScope = creditCost > 0 ? CreditScope.BOARD : CreditScope.NONE;
        }
        if (creditScope == CreditScope.BOARD && creditCost > 0 && boardId == null) {
            throw new IllegalArgumentException("boardId is required to consume board credit");
        }
        if (creditScope == CreditScope.USER && creditCost > 0 && userId == null) {
            throw new IllegalArgumentException("userId is required to consume personal credit");
        }
    }

    /** 이 호출이 실제로 크레딧을 차감하는지 */
    public boolean consumesCredit() {
        return (creditScope == CreditScope.BOARD || creditScope == CreditScope.USER) && creditCost > 0;
    }
}
