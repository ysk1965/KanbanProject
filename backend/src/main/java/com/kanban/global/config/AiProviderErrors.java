package com.kanban.global.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.global.exception.ErrorCode;
import org.springframework.web.client.HttpStatusCodeException;

import java.util.Locale;

/**
 * AI 프로바이더의 HTTP 오류를 <b>원인별</b> {@link ErrorCode}로 분류한다.
 *
 * <p>배경: 이전에는 2xx가 아닌 응답을 전부 하나의 코드로 뭉뚱그렸다. 그 결과 실제 원인이
 * "조직 크레딧 소진"인 장애가 클라이언트에는 "AI 프로바이더 호출에 실패했습니다"로만 보였고,
 * 툴 쪽 안내 문구와 겹쳐 <b>토큰 만료로 오진</b>됐다. 서버 로그도 상태코드만 남겨서 진단이
 * 불가능했다.
 *
 * <p><b>상태코드만으로는 구분되지 않는다.</b> Anthropic은 크레딧 소진을 401이 아니라
 * {@code 400 invalid_request_error}로 돌려주고, OpenAI는 {@code 429 insufficient_quota}로
 * 돌려준다. 그래서 본문의 {@code type}/{@code code}/{@code message}까지 봐야 한다.
 *
 * <p><b>로깅 정책:</b> 프로바이더의 오류 본문은 실패 사유만 담고 요청 프롬프트 본문은 싣지
 * 않는다(최대 필드 경로 정도). 다만 만일을 대비해 {@link #LOG_MESSAGE_LIMIT}자로 자른다.
 */
final class AiProviderErrors {

    /** 오류 본문 파싱 전용. 요청/응답 직렬화에는 관여하지 않으므로 주입받지 않는다. */
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 로그에 남길 프로바이더 메시지 길이 상한. */
    private static final int LOG_MESSAGE_LIMIT = 200;

    private AiProviderErrors() {
    }

    /**
     * @param fallback 어느 분류에도 해당하지 않을 때 쓸 코드. 호출 경로마다 기존 계약이 달라
     *                 (구조화 호출은 {@code AI_PROVIDER_UNAVAILABLE}, 일반 호출은
     *                 {@code AI_REPORT_GENERATION_FAILED}) 여기서 고정하지 않는다.
     */
    static ErrorCode classify(HttpStatusCodeException e, ErrorCode fallback) {
        int status = e.getStatusCode().value();
        Body body = parse(e);

        // 크레딧 소진이 상태코드를 가리지 않으므로 가장 먼저 본다
        if (isCreditExhausted(body)) {
            return ErrorCode.AI_PROVIDER_CREDIT_EXHAUSTED;
        }
        if (status == 401 || status == 403) {
            return ErrorCode.AI_PROVIDER_KEY_REJECTED;
        }
        if (status == 429) {
            return ErrorCode.AI_PROVIDER_RATE_LIMITED;
        }
        // 4xx 중 우리 요청이 잘못된 경우 — 모델 ID 오타, 스키마 위반, 입력 초과 등
        if (status >= 400 && status < 500) {
            return ErrorCode.AI_PROVIDER_REQUEST_REJECTED;
        }
        return fallback;
    }

    /** 로그용 한 줄 요약. 프롬프트가 실릴 여지를 줄이려 길이를 자른다. */
    static String describe(HttpStatusCodeException e) {
        Body body = parse(e);
        String message = body.message();
        if (message.length() > LOG_MESSAGE_LIMIT) {
            message = message.substring(0, LOG_MESSAGE_LIMIT) + "…";
        }
        if (body.type().isBlank() && message.isBlank()) {
            return "(no error body)";
        }
        return body.type().isBlank() ? message : body.type() + ": " + message;
    }

    /**
     * 크레딧/쿼터 소진 판정. 프로바이더마다 표현이 달라 신호를 나열한다.
     *
     * <ul>
     *   <li>Anthropic: {@code 400 invalid_request_error} + "Your credit balance is too low…"</li>
     *   <li>OpenAI: {@code 429} + {@code type/code = insufficient_quota} + "You exceeded your current quota…"</li>
     * </ul>
     *
     * <p>"billing" 같은 넓은 단어는 쓰지 않는다 — 무관한 오류를 크레딧 소진으로 오분류하면
     * 이번과 정반대 방향의 오진이 된다.
     */
    private static boolean isCreditExhausted(Body body) {
        String haystack = (body.type() + " " + body.code() + " " + body.message()).toLowerCase(Locale.ROOT);
        return haystack.contains("credit balance")
                || haystack.contains("insufficient_quota")
                || haystack.contains("exceeded your current quota");
    }

    private static Body parse(HttpStatusCodeException e) {
        try {
            JsonNode error = MAPPER.readTree(e.getResponseBodyAsString()).path("error");
            return new Body(
                    error.path("type").asText(""),
                    error.path("code").asText(""),
                    error.path("message").asText(""));
        } catch (Exception ignored) {
            // 본문이 비었거나 JSON이 아닌 경우(게이트웨이 HTML 등). 상태코드만으로 분류한다.
            return new Body("", "", "");
        }
    }

    /** 프로바이더 오류 본문의 공통 부분. 값이 없으면 빈 문자열이다. */
    private record Body(String type, String code, String message) {
    }
}
