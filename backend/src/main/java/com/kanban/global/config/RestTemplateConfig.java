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
