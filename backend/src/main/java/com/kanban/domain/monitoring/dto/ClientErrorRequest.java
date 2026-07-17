package com.kanban.domain.monitoring.dto;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 프론트엔드 클라이언트 에러 리포트 요청 DTO.
 * Jackson SNAKE_CASE 전략으로 user_agent → userAgent, component_stack → componentStack 매핑.
 */
public class ClientErrorRequest {

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Report {

        @Size(max = 500, message = "message는 500자 이하여야 합니다")
        private String message;

        @Size(max = 20)
        private String kind;

        @Size(max = 100)
        private String release;

        @Size(max = 1000)
        private String url;

        @Size(max = 500)
        private String userAgent;

        @Size(max = 8000)
        private String stack;

        @Size(max = 8000)
        private String componentStack;
    }
}
