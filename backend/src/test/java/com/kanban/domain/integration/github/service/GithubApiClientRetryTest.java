package com.kanban.domain.integration.github.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.integration.github.config.GithubAppProperties;
import com.kanban.domain.integration.github.dto.GithubCommit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 커밋 목록 조회의 일시적 타임아웃 재시도 검증.
 * GitHub가 순간적으로 느려 저장소 조회가 한 번 끊겨도, 재시도로 소스 전체가 실패로 떨어지지 않아야 한다.
 */
@ExtendWith(MockitoExtension.class)
class GithubApiClientRetryTest {

    @Mock GithubAppTokenService tokenService;
    @Mock RestTemplate restTemplate;

    GithubAppProperties properties;
    GithubApiClient client;

    @BeforeEach
    void setUp() {
        properties = new GithubAppProperties();
        properties.setApiRetryBackoffMillis(0); // 테스트에서 대기 제거
        client = new GithubApiClient(properties, tokenService, restTemplate);
        lenient().when(tokenService.getInstallationToken(anyString())).thenReturn("token");
    }

    private ResponseEntity<JsonNode> emptyArray() {
        JsonNode empty = new ObjectMapper().createArrayNode();
        return ResponseEntity.ok(empty);
    }

    @Test
    void listCommits_일시적_타임아웃이면_재시도해서_성공한다() {
        properties.setApiRetryCount(1);
        // 첫 시도는 타임아웃, 두 번째는 정상(빈 배열 → 첫 페이지에서 종료)
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(JsonNode.class)))
                .thenThrow(new ResourceAccessException("Request timed out"))
                .thenReturn(emptyArray());

        List<GithubCommit> commits = client.listCommits("inst", "org/repo", "main", "since", "until");

        assertTrue(commits.isEmpty());
        verify(restTemplate, times(2))
                .exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(JsonNode.class));
    }

    @Test
    void listCommits_재시도_상한을_넘으면_타임아웃을_전파한다() {
        properties.setApiRetryCount(1);
        // 재시도 1회 포함 두 번 모두 타임아웃 → 예외 전파(호출부의 per-repo catch가 failedRepos로 처리)
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(JsonNode.class)))
                .thenThrow(new ResourceAccessException("Request timed out"));

        assertThrows(ResourceAccessException.class,
                () -> client.listCommits("inst", "org/repo", "main", "since", "until"));
        verify(restTemplate, times(2))
                .exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(JsonNode.class));
    }
}
