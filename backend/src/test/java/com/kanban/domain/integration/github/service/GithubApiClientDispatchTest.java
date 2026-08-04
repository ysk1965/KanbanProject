package com.kanban.domain.integration.github.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.integration.github.config.GithubAppProperties;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 자동수정 러너 트리거 계약 고정.
 *
 * <p>셋업 단계에서 실패가 몰리는 지점(워크플로 미존재, ref 오류, inputs 상한)이 서로 구분되는지를 잡는다 —
 * 전부 "GitHub API 실패"로 뭉개지면 원인을 못 찾는다.
 */
@ExtendWith(MockitoExtension.class)
class GithubApiClientDispatchTest {

    @Mock GithubAppTokenService tokenService;
    @Mock RestTemplate restTemplate;

    GithubAppProperties properties;
    GithubApiClient client;

    @BeforeEach
    void setUp() {
        properties = new GithubAppProperties();
        properties.setApiRetryBackoffMillis(0);
        client = new GithubApiClient(properties, tokenService, restTemplate);
        lenient().when(tokenService.getInstallationToken(anyString())).thenReturn("token");
    }

    private HttpClientErrorException status(HttpStatus status) {
        return HttpClientErrorException.create(
                status, status.getReasonPhrase(), null, null, null);
    }

    @Test
    @DisplayName("디스패치 — 올바른 URL과 ref/inputs 본문으로 POST한다")
    @SuppressWarnings("unchecked")
    void dispatchesWithRefAndInputs() {
        when(restTemplate.exchange(anyString(), eq(HttpMethod.POST), any(HttpEntity.class), eq(Void.class)))
                .thenReturn(ResponseEntity.noContent().build());

        client.dispatchWorkflow("inst", "org/repo", "autofix.yml", "develop",
                Map.of("issue_key", "QASA-92"));

        ArgumentCaptor<String> url = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<HttpEntity<Map<String, Object>>> entity = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate).exchange(url.capture(), eq(HttpMethod.POST), entity.capture(), eq(Void.class));

        assertThat(url.getValue())
                .endsWith("/repos/org/repo/actions/workflows/autofix.yml/dispatches");

        Map<String, Object> body = entity.getValue().getBody();
        assertThat(body).containsEntry("ref", "develop");
        assertThat((Map<String, String>) body.get("inputs")).containsEntry("issue_key", "QASA-92");
        assertThat(entity.getValue().getHeaders().getFirst("X-GitHub-Api-Version"))
                .isEqualTo("2022-11-28");
    }

    @Test
    @DisplayName("inputs가 없으면 본문에 inputs 키를 넣지 않는다")
    void omitsEmptyInputs() {
        when(restTemplate.exchange(anyString(), eq(HttpMethod.POST), any(HttpEntity.class), eq(Void.class)))
                .thenReturn(ResponseEntity.noContent().build());

        client.dispatchWorkflow("inst", "org/repo", "autofix.yml", "main", Map.of());

        ArgumentCaptor<HttpEntity<Map<String, Object>>> entity = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate).exchange(anyString(), eq(HttpMethod.POST), entity.capture(), eq(Void.class));
        assertThat(entity.getValue().getBody()).doesNotContainKey("inputs");
    }

    @Test
    @DisplayName("inputs 10개 초과는 호출 전에 막는다 — GitHub 제약")
    void rejectsTooManyInputs() {
        Map<String, String> inputs = new HashMap<>();
        for (int i = 0; i < 11; i++) inputs.put("k" + i, "v");

        assertThatThrownBy(() ->
                client.dispatchWorkflow("inst", "org/repo", "autofix.yml", "main", inputs))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("최대 10개");

        verify(restTemplate, never()).exchange(anyString(), any(), any(), eq(Void.class));
    }

    @Test
    @DisplayName("422는 ref/inputs 불일치로 안내한다 — 셋업 단계 최빈 실패")
    void unprocessableGivesSetupHint() {
        when(restTemplate.exchange(anyString(), eq(HttpMethod.POST), any(HttpEntity.class), eq(Void.class)))
                .thenThrow(status(HttpStatus.UNPROCESSABLE_ENTITY));

        assertThatThrownBy(() ->
                client.dispatchWorkflow("inst", "org/repo", "autofix.yml", "nope", Map.of()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("ref(nope)")
                .hasMessageContaining("workflow_dispatch inputs");
    }

    @Test
    @DisplayName("403(권한 부족)은 인증 실패로 매핑된다 — Actions 쓰기 권한 미부여 신호")
    void forbiddenMapsToAuthFailure() {
        when(restTemplate.exchange(anyString(), eq(HttpMethod.POST), any(HttpEntity.class), eq(Void.class)))
                .thenThrow(status(HttpStatus.FORBIDDEN));

        assertThatThrownBy(() ->
                client.dispatchWorkflow("inst", "org/repo", "autofix.yml", "main", Map.of()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.GITHUB_AUTH_FAILED);
    }

    @Test
    @DisplayName("워크플로 존재 확인 — 404는 예외가 아니라 false다")
    void hasWorkflowReturnsFalseOn404() {
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(JsonNode.class)))
                .thenThrow(status(HttpStatus.NOT_FOUND));

        assertThat(client.hasWorkflow("inst", "org/repo", "autofix.yml")).isFalse();
    }

    @Test
    @DisplayName("워크플로 존재 확인 — 200이면 true")
    void hasWorkflowReturnsTrue() {
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(JsonNode.class)))
                .thenReturn(ResponseEntity.ok(new ObjectMapper().createObjectNode()));

        assertThat(client.hasWorkflow("inst", "org/repo", "autofix.yml")).isTrue();
    }
}
