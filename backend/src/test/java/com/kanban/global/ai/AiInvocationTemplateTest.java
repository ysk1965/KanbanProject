package com.kanban.global.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.CreditConsumption;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.domain.system.MonetizationService;
import com.kanban.global.config.AIProvider;
import com.kanban.global.config.AIResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

@ExtendWith(MockitoExtension.class)
class AiInvocationTemplateTest {

    @Mock
    AIProvider aiProvider;

    @Mock
    AiCreditService aiCreditService;

    @Mock
    MonetizationService monetizationService;

    @Mock
    AiUsageLogRepository aiUsageLogRepository;

    @Mock
    PlatformTransactionManager transactionManager;

    AiInvocationTemplate template;

    private static final AIResponse OK = new AIResponse("```json\n{\"items\":[1]}\n```", 10, 20, "m-1");

    @BeforeEach
    void setUp() {
        TransactionStatus status = new SimpleTransactionStatus();
        lenient().when(transactionManager.getTransaction(any())).thenReturn(status);
        lenient().when(monetizationService.isMonetizationEnabled()).thenReturn(true);
        lenient()
                .when(aiCreditService.consumeCredit(any(), any(), any(), anyInt()))
                .thenReturn(CreditConsumption.monthly(1));
        template = new AiInvocationTemplate(
                aiProvider,
                aiCreditService,
                monetizationService,
                aiUsageLogRepository,
                new ObjectMapper(),
                transactionManager,
                "claude");
    }

    private AiInvocationRequest.AiInvocationRequestBuilder boardRequest() {
        return AiInvocationRequest.builder()
                .boardId("b")
                .userId("u")
                .featureType("MEETING")
                .creditCost(1)
                .systemPrompt("s")
                .userPrompt("p")
                .model("m-1")
                .maxTokens(100);
    }

    @Test
    void 크레딧차감_호출_로그_파싱_순서로_실행된다() {
        when(aiProvider.chatWithUsage(eq("s"), eq("p"), eq("m-1"), eq(100), isNull()))
                .thenReturn(OK);

        String result = template.invoke(boardRequest().build(), content -> AiInvocationTemplate.extractJson(content));

        assertEquals("{\"items\":[1]}", result);
        InOrder order = inOrder(aiCreditService, aiProvider, aiUsageLogRepository);
        order.verify(aiCreditService).consumeCredit("b", "u", "MEETING", 1);
        order.verify(aiProvider).chatWithUsage(eq("s"), eq("p"), eq("m-1"), eq(100), isNull());
        ArgumentCaptor<AiUsageLog> captor = ArgumentCaptor.forClass(AiUsageLog.class);
        order.verify(aiUsageLogRepository).save(captor.capture());
        assertEquals("MEETING", captor.getValue().getFeatureType());
        assertEquals("CLAUDE", captor.getValue().getProvider());
        assertEquals(10, captor.getValue().getInputTokens());
        assertEquals(1, captor.getValue().getCreditsUsed());
        verify(aiCreditService, never())
                .refundCredit(anyString(), anyString(), anyString(), any(CreditConsumption.class));
    }

    @Test
    void 크레딧이_없으면_AI를_부르지_않는다() {
        doThrow(new BusinessException(ErrorCode.AI_CREDITS_EXHAUSTED))
                .when(aiCreditService)
                .consumeCredit("b", "u", "MEETING", 1);

        BusinessException e = assertThrows(
                BusinessException.class, () -> template.invoke(boardRequest().build(), c -> c));

        assertEquals(ErrorCode.AI_CREDITS_EXHAUSTED, e.getErrorCode());
        verify(aiProvider, never()).chatWithUsage(any(), any(), any(), anyInt(), any());
        verify(aiCreditService, never())
                .refundCredit(anyString(), anyString(), anyString(), any(CreditConsumption.class));
    }

    @Test
    void 프로바이더가_실패하면_크레딧을_돌려주고_같은_예외를_던진다() {
        when(aiProvider.chatWithUsage(any(), any(), any(), anyInt(), any()))
                .thenThrow(new BusinessException(ErrorCode.AI_PROVIDER_UNAVAILABLE));

        BusinessException e = assertThrows(
                BusinessException.class, () -> template.invoke(boardRequest().build(), c -> c));

        assertEquals(ErrorCode.AI_PROVIDER_UNAVAILABLE, e.getErrorCode());
        verify(aiCreditService).refundCredit("b", "u", "MEETING", CreditConsumption.monthly(1));
        verify(aiUsageLogRepository, never()).save(any());
    }

    @Test
    void 파싱이_실패해도_크레딧을_돌려주되_사용량_로그는_남긴다() {
        when(aiProvider.chatWithUsage(any(), any(), any(), anyInt(), any())).thenReturn(OK);

        assertThrows(
                IllegalStateException.class,
                () -> template.invoke(boardRequest().build(), c -> {
                    throw new IllegalStateException("bad json");
                }));

        verify(aiCreditService).refundCredit("b", "u", "MEETING", CreditConsumption.monthly(1));
        verify(aiUsageLogRepository).save(any());
    }

    @Test
    void keepCreditOnFailure면_환불하지_않는다() {
        when(aiProvider.chatWithUsage(any(), any(), any(), anyInt(), any()))
                .thenThrow(new BusinessException(ErrorCode.AI_PROVIDER_UNAVAILABLE));

        assertThrows(
                BusinessException.class,
                () -> template.invoke(boardRequest().keepCreditOnFailure(true).build(), c -> c));

        verify(aiCreditService, never())
                .refundCredit(anyString(), anyString(), anyString(), any(CreditConsumption.class));
    }

    @Test
    void MIXED로_차감됐으면_환불도_같은_분할로_넘긴다() {
        CreditConsumption mixed = new CreditConsumption(1, 2);
        when(aiCreditService.consumeCredit("b", "u", "MEETING", 3)).thenReturn(mixed);
        when(aiProvider.chatWithUsage(any(), any(), any(), anyInt(), any()))
                .thenThrow(new BusinessException(ErrorCode.AI_PROVIDER_UNAVAILABLE));

        assertThrows(
                BusinessException.class,
                () -> template.invoke(boardRequest().creditCost(3).build(), c -> c));

        verify(aiCreditService).refundCredit("b", "u", "MEETING", mixed);
    }

    @Test
    void 수익화가_꺼져있으면_차감된_게_없으니_환불도_없다() {
        when(monetizationService.isMonetizationEnabled()).thenReturn(false);
        when(aiCreditService.consumeCredit("b", "u", "MEETING", 1)).thenReturn(CreditConsumption.NONE);
        when(aiProvider.chatWithUsage(any(), any(), any(), anyInt(), any()))
                .thenThrow(new BusinessException(ErrorCode.AI_PROVIDER_UNAVAILABLE));

        assertThrows(
                BusinessException.class, () -> template.invoke(boardRequest().build(), c -> c));

        verify(aiCreditService).consumeCredit("b", "u", "MEETING", 1);
        verify(aiCreditService, never())
                .refundCredit(anyString(), anyString(), anyString(), any(CreditConsumption.class));
    }

    @Test
    void NONE_스코프는_차감도_환불도_없이_로그만_남긴다() {
        when(aiProvider.chatWithUsage(any(), any(), any(), anyInt(), any())).thenReturn(OK);

        template.chat(AiInvocationRequest.builder()
                .boardId("b")
                .featureType("STANDUP")
                .creditScope(AiInvocationRequest.CreditScope.NONE)
                .creditCost(1)
                .systemPrompt("s")
                .userPrompt("p")
                .model("m-1")
                .maxTokens(10)
                .build());

        verify(aiCreditService, never()).consumeCredit(any(), any(), any(), anyInt());
        verify(aiUsageLogRepository).save(any());
    }

    @Test
    void 사용량_로그_저장_실패는_결과에_영향이_없다() {
        when(aiProvider.chatWithUsage(any(), any(), any(), anyInt(), any())).thenReturn(OK);
        when(aiUsageLogRepository.save(any())).thenThrow(new RuntimeException("db down"));

        AIResponse response = template.chat(boardRequest().build());

        assertEquals(OK, response);
        verify(aiCreditService, never())
                .refundCredit(anyString(), anyString(), anyString(), any(CreditConsumption.class));
    }

    @Test
    void extractJson은_코드펜스와_앞뒤_설명을_벗긴다() {
        assertEquals("{\"a\":1}", AiInvocationTemplate.extractJson("Sure! ```json\n{\"a\":1}\n``` done"));
        assertEquals("{\"a\":1}", AiInvocationTemplate.extractJson("Here you go: {\"a\":1} thanks"));
        assertEquals("{}", AiInvocationTemplate.extractJson(null));
    }

    @Test
    void extractJson은_닫는_중괄호가_하나도_없으면_잘린_JSON을_닫아준다() {
        // 닫는 }가 하나라도 있으면 첫 {~마지막 } 구간을 그대로 쓴다 (기존 MeetingAIService 동작 유지)
        String partiallyClosed = "{\"items\":[{\"title\":\"a\"},{\"title\":\"b";
        assertEquals("{\"items\":[{\"title\":\"a\"}", AiInvocationTemplate.extractJson(partiallyClosed));

        // 닫는 }가 전혀 없을 때만 마지막 완전한 토큰까지 자르고 열린 괄호를 닫는다 (기존 MeetingAIService 복구 로직 그대로)
        String truncated = "{\"items\":[1,2";
        assertEquals("{\"items\":[1]}", AiInvocationTemplate.extractJson(truncated));
    }
}
