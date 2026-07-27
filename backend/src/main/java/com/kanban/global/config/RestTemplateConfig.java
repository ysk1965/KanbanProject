package com.kanban.global.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Configuration
public class RestTemplateConfig {

    @Primary
    @Bean
    public RestTemplate restTemplate(RestTemplateBuilder builder) {
        return builder
                .connectTimeout(Duration.ofSeconds(5))
                .readTimeout(Duration.ofSeconds(5))
                .build();
    }

    /**
     * GitHub REST 전용 RestTemplate. 커밋 목록·상세 조회는 저장소가 크거나 GitHub가
     * 붐빌 때 기본 5초 read timeout으로 자주 끊긴다(주간 리포트 수집 실패의 주원인).
     * read timeout을 넉넉히 주되, 커밋 상세는 호출부(GithubCommitSource)에서 전체
     * 시간 예산으로 총량을 따로 제한한다.
     */
    @Bean("githubRestTemplate")
    public RestTemplate githubRestTemplate(RestTemplateBuilder builder) {
        return builder
                .connectTimeout(Duration.ofSeconds(5))
                .readTimeout(Duration.ofSeconds(15))
                .build();
    }

    /**
     * 대용량 파일 다운로드 전용 RestTemplate. 슬랙 영상(수십~수백 MB) 이관처럼 전송에
     * 오래 걸리는 요청은 기본 5초 read timeout으로는 중간에 끊긴다. 이 빈은 넉넉한
     * timeout으로 큰 파일도 끝까지 받도록 한다. (기본 빈은 빠른 API 호출용으로 유지)
     */
    @Bean("fileDownloadRestTemplate")
    public RestTemplate fileDownloadRestTemplate(RestTemplateBuilder builder) {
        return builder
                .connectTimeout(Duration.ofSeconds(10))
                .readTimeout(Duration.ofMinutes(5))
                .build();
    }
}
