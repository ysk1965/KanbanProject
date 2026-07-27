package com.kanban.domain.ai.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.ai.dto.CommitPlanRequest;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.global.config.ClaudeAIProvider;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 커밋 플랜 계약 고정 테스트.
 *
 * <p>스펙이 요구하는 것 중 런타임에만 드러나는 부분을 잡는다: {@code stop_reason} → HTTP 상태 매핑,
 * groups 필수 검증, 유저 프롬프트 구성, 사용량 기록 단가.
 */
class CommitPlanServiceTest {

    private static final String MODEL = "claude-opus-4-8";

    private ClaudeAIProvider claudeAIProvider;
    private AiUsageLogRepository aiUsageLogRepository;
    private CommitPlanService service;

    @BeforeEach
    void setUp() {
        claudeAIProvider = mock(ClaudeAIProvider.class);
        aiUsageLogRepository = mock(AiUsageLogRepository.class);
        service = new CommitPlanService(claudeAIProvider, aiUsageLogRepository, new ObjectMapper());
        ReflectionTestUtils.setField(service, "model", MODEL);
    }

    private CommitPlanRequest request(List<String> unmapped) {
        return new CommitPlanRequest(
                List.of(new CommitPlanRequest.Group("title",
                        List.of("Assets/_Project/Scripts/UI/Title/TitleMain.cs"))),
                unmapped,
                "diff --git a/... (로그인 커버 선생성 로직 추가)",
                "- `title` — 타이틀");
    }

    private void stubClaude(String json, String stopReason) {
        when(claudeAIProvider.chatStructured(any(), any(), eq(MODEL), anyInt(), any()))
                .thenReturn(new ClaudeAIProvider.StructuredResponse(json, stopReason, 1000, 500, MODEL));
    }

    @Test
    @DisplayName("groups가 없으면 400 CP001 — AI를 호출하지 않는다")
    void groupsRequired() {
        CommitPlanRequest empty = new CommitPlanRequest(null, List.of(), "diff", "scopes");

        assertThatThrownBy(() -> service.generate(empty, "user-1"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMIT_PLAN_GROUPS_REQUIRED);

        verify(claudeAIProvider, never()).chatStructured(any(), any(), any(), anyInt(), any());
    }

    @Test
    @DisplayName("정상 응답 — commits/unmapped 를 그대로 통과시킨다")
    void success() {
        stubClaude("""
                {"commits":[{"files":["Assets/_Project/Scripts/UI/Title/TitleMain.cs"],
                "type":"fix","scope":"title","subject":"첫 로그인 로딩 커버 이중 노출",
                "body":"커버를 선생성해 중복 표시를 막는다"}],"unmapped":[]}
                """, "end_turn");

        JsonNode result = service.generate(request(List.of()), "user-1");

        assertThat(result.get("commits")).hasSize(1);
        assertThat(result.get("commits").get(0).get("scope").asText()).isEqualTo("title");
        assertThat(result.get("unmapped")).isEmpty();
    }

    @Test
    @DisplayName("stop_reason=refusal → 422 CP002")
    void refusalMapsTo422() {
        stubClaude(null, "refusal");

        assertThatThrownBy(() -> service.generate(request(List.of()), "user-1"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMIT_PLAN_REFUSED);
    }

    @Test
    @DisplayName("stop_reason=max_tokens → 502 CP003")
    void maxTokensMapsTo502() {
        stubClaude("{\"commits\":[", "max_tokens");

        assertThatThrownBy(() -> service.generate(request(List.of()), "user-1"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMIT_PLAN_TRUNCATED);
    }

    @Test
    @DisplayName("실패해도 사용량은 기록된다 — 토큰은 이미 소비됐다")
    void usageRecordedEvenOnRefusal() {
        stubClaude(null, "refusal");

        assertThatThrownBy(() -> service.generate(request(List.of()), "user-1"))
                .isInstanceOf(BusinessException.class);

        verify(aiUsageLogRepository).save(any(AiUsageLog.class));
    }

    @Test
    @DisplayName("사용량 기록 — Opus 4.8 단가가 적용된다(gpt-4o-mini 폴백 아님)")
    void usageUsesOpusPricing() {
        stubClaude("{\"commits\":[],\"unmapped\":[]}", "end_turn");

        service.generate(request(List.of()), "user-1");

        ArgumentCaptor<AiUsageLog> captor = ArgumentCaptor.forClass(AiUsageLog.class);
        verify(aiUsageLogRepository).save(captor.capture());
        AiUsageLog log = captor.getValue();

        assertThat(log.getFeatureType()).isEqualTo("COMMIT_PLAN");
        assertThat(log.getProvider()).isEqualTo("claude");
        assertThat(log.getBoardId()).isNull();           // 에디터 호출 — 보드 컨텍스트 없음
        assertThat(log.getCreditsUsed()).isZero();       // 보드 크레딧 차감 안 함
        // input 1000 * $5/1M + output 500 * $25/1M = 0.005 + 0.0125
        assertThat(log.getEstimatedCostUsd()).isEqualTo(0.0175);
    }

    @Test
    @DisplayName("프롬프트 구성 — scopes 주입, 미분류 없으면 '(없음)'")
    void promptComposition() {
        stubClaude("{\"commits\":[],\"unmapped\":[]}", "end_turn");

        service.generate(request(List.of()), "user-1");

        ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        verify(claudeAIProvider).chatStructured(
                system.capture(), user.capture(), eq(MODEL), eq(4096), any());

        assertThat(system.getValue())
                .contains("scope 사전:")
                .contains("- `title` — 타이틀")
                .contains("subject는 반드시 도메인 명사로 시작한다");
        assertThat(user.getValue())
                .contains("1차 그룹 (경로 기반 결정론 분할):")
                .contains("[title]")
                .contains("Assets/_Project/Scripts/UI/Title/TitleMain.cs")
                .contains("미분류 파일:\n(없음)")
                .contains("diff 요약:");
    }

    @Test
    @DisplayName("미분류 파일이 있으면 그대로 프롬프트에 실린다")
    void promptIncludesUnmapped() {
        stubClaude("{\"commits\":[],\"unmapped\":[\"Assets/Art/Mask.mat\"]}", "end_turn");

        service.generate(request(List.of("Assets/Art/Mask.mat")), "user-1");

        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        verify(claudeAIProvider).chatStructured(any(), user.capture(), any(), anyInt(), any());

        assertThat(user.getValue()).contains("미분류 파일:\nAssets/Art/Mask.mat");
        assertThat(user.getValue()).doesNotContain("(없음)");
    }

    @Test
    @DisplayName("출력 스키마는 스펙과 동일하다 — 필수 필드/additionalProperties 고정")
    @SuppressWarnings("unchecked")
    void outputSchemaMatchesSpec() {
        stubClaude("{\"commits\":[],\"unmapped\":[]}", "end_turn");

        service.generate(request(List.of()), "user-1");

        ArgumentCaptor<Map<String, Object>> schema = ArgumentCaptor.forClass(Map.class);
        verify(claudeAIProvider).chatStructured(any(), any(), any(), anyInt(), schema.capture());
        Map<String, Object> root = schema.getValue();

        assertThat(root.get("type")).isEqualTo("object");
        assertThat(root.get("additionalProperties")).isEqualTo(false);
        assertThat((List<String>) root.get("required")).containsExactlyInAnyOrder("commits", "unmapped");

        Map<String, Object> properties = (Map<String, Object>) root.get("properties");
        Map<String, Object> commitItem =
                (Map<String, Object>) ((Map<String, Object>) properties.get("commits")).get("items");
        assertThat(commitItem.get("additionalProperties")).isEqualTo(false);
        assertThat((List<String>) commitItem.get("required"))
                .containsExactlyInAnyOrder("files", "type", "scope", "subject", "body");
    }
}
