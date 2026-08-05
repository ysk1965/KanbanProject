package com.kanban.global.config;

import com.kanban.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.HttpStatusCodeException;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 프로바이더 오류 분류 규칙을 고정한다.
 *
 * <p>이 테스트가 지키는 건 "상태코드만으로 판단하지 않는다"는 점이다. 실제 장애에서 크레딧
 * 소진이 {@code 400}으로 내려왔고, 그걸 일반 실패로 뭉뚱그린 탓에 토큰 만료로 오진됐다.
 */
class AiProviderErrorsTest {

    @Test
    @DisplayName("Anthropic 크레딧 소진(400)은 상태코드가 아니라 본문으로 잡아 AP003으로 분류한다")
    void anthropicCreditExhausted() {
        HttpStatusCodeException e = clientError(HttpStatus.BAD_REQUEST, """
                {"type":"error","error":{"type":"invalid_request_error",
                 "message":"Your credit balance is too low to access the Anthropic API. \
                 Please go to Plans & Billing to upgrade or purchase credits."}}
                """);

        assertThat(AiProviderErrors.classify(e, ErrorCode.AI_PROVIDER_UNAVAILABLE))
                .isEqualTo(ErrorCode.AI_PROVIDER_CREDIT_EXHAUSTED);
    }

    @Test
    @DisplayName("OpenAI 쿼터 소진(429)은 한도 초과(AP001)가 아니라 크레딧 소진(AP003)이다")
    void openAiQuotaExhaustedBeatsRateLimit() {
        HttpStatusCodeException e = clientError(HttpStatus.TOO_MANY_REQUESTS, """
                {"error":{"type":"insufficient_quota","code":"insufficient_quota",
                 "message":"You exceeded your current quota, please check your plan and billing details."}}
                """);

        assertThat(AiProviderErrors.classify(e, ErrorCode.AI_REPORT_GENERATION_FAILED))
                .isEqualTo(ErrorCode.AI_PROVIDER_CREDIT_EXHAUSTED);
    }

    @Test
    @DisplayName("401/403은 키 거부(AP004)")
    void authFailures() {
        String body = """
                {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}
                """;

        assertThat(AiProviderErrors.classify(clientError(HttpStatus.UNAUTHORIZED, body),
                ErrorCode.AI_PROVIDER_UNAVAILABLE)).isEqualTo(ErrorCode.AI_PROVIDER_KEY_REJECTED);
        assertThat(AiProviderErrors.classify(clientError(HttpStatus.FORBIDDEN, body),
                ErrorCode.AI_PROVIDER_UNAVAILABLE)).isEqualTo(ErrorCode.AI_PROVIDER_KEY_REJECTED);
    }

    @Test
    @DisplayName("쿼터 신호가 없는 429는 그대로 한도 초과(AP001)")
    void plainRateLimit() {
        HttpStatusCodeException e = clientError(HttpStatus.TOO_MANY_REQUESTS, """
                {"type":"error","error":{"type":"rate_limit_error","message":"Number of requests has exceeded your rate limit"}}
                """);

        assertThat(AiProviderErrors.classify(e, ErrorCode.AI_PROVIDER_UNAVAILABLE))
                .isEqualTo(ErrorCode.AI_PROVIDER_RATE_LIMITED);
    }

    @Test
    @DisplayName("우리 요청이 잘못된 4xx는 AP005 — 크레딧 소진과 섞이지 않는다")
    void requestRejected() {
        HttpStatusCodeException schemaError = clientError(HttpStatus.BAD_REQUEST, """
                {"type":"error","error":{"type":"invalid_request_error",
                 "message":"output_config.format.schema: additionalProperties must be false"}}
                """);
        HttpStatusCodeException unknownModel = clientError(HttpStatus.NOT_FOUND, """
                {"type":"error","error":{"type":"not_found_error","message":"model: claude-opus-4-9"}}
                """);

        assertThat(AiProviderErrors.classify(schemaError, ErrorCode.AI_PROVIDER_UNAVAILABLE))
                .isEqualTo(ErrorCode.AI_PROVIDER_REQUEST_REJECTED);
        assertThat(AiProviderErrors.classify(unknownModel, ErrorCode.AI_PROVIDER_UNAVAILABLE))
                .isEqualTo(ErrorCode.AI_PROVIDER_REQUEST_REJECTED);
    }

    @Test
    @DisplayName("5xx와 파싱 불가 본문은 호출부가 준 fallback을 그대로 쓴다")
    void fallbacks() {
        HttpStatusCodeException overloaded = serverError(HttpStatus.SERVICE_UNAVAILABLE,
                "{\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}");
        HttpStatusCodeException html = serverError(HttpStatus.BAD_GATEWAY, "<html>502 Bad Gateway</html>");

        assertThat(AiProviderErrors.classify(overloaded, ErrorCode.AI_PROVIDER_UNAVAILABLE))
                .isEqualTo(ErrorCode.AI_PROVIDER_UNAVAILABLE);
        // 호출 경로마다 fallback 계약이 다르다는 점도 고정한다
        assertThat(AiProviderErrors.classify(html, ErrorCode.AI_REPORT_GENERATION_FAILED))
                .isEqualTo(ErrorCode.AI_REPORT_GENERATION_FAILED);
    }

    @Test
    @DisplayName("describe는 사유를 남기되 길이를 제한한다 (프롬프트 유출 방지)")
    void describeTruncates() {
        String longMessage = "x".repeat(500);
        HttpStatusCodeException e = clientError(HttpStatus.BAD_REQUEST,
                "{\"error\":{\"type\":\"invalid_request_error\",\"message\":\"" + longMessage + "\"}}");

        String described = AiProviderErrors.describe(e);

        assertThat(described).startsWith("invalid_request_error: ");
        assertThat(described).endsWith("…");
        assertThat(described.length()).isLessThan(longMessage.length());
    }

    @Test
    @DisplayName("본문이 없어도 describe는 죽지 않는다")
    void describeWithoutBody() {
        assertThat(AiProviderErrors.describe(clientError(HttpStatus.BAD_REQUEST, "")))
                .isEqualTo("(no error body)");
    }

    private static HttpStatusCodeException clientError(HttpStatus status, String body) {
        return HttpClientErrorException.create(status, status.getReasonPhrase(), new HttpHeaders(),
                body.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8);
    }

    private static HttpStatusCodeException serverError(HttpStatus status, String body) {
        return HttpServerErrorException.create(status, status.getReasonPhrase(), new HttpHeaders(),
                body.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8);
    }
}
