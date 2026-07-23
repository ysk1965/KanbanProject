package com.kanban.domain.report.source;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 소스 하나의 수집 결과.
 *
 * <p>실패를 예외로 던지지 않고 값으로 표현하는 것이 요점이다. GitHub 수집이 실패해도
 * 칸반·Confluence로 보고서는 나가야 하고, 대신 "GitHub 수집 실패"가 본문에 한 줄로 남아야 한다.
 */
public record SourceChunk(
        SourceKind kind,
        boolean success,
        String errorMessage,
        /** AI에 투입할 원본 JSON. 실패했거나 수집할 게 없으면 null. */
        String dataJson,
        /** 지표 카드에 그대로 쓰이는 숫자들 (커밋 수, 기여자 수 등) */
        Map<String, Object> metrics,
        /** 사람이 읽는 한 줄 요약 — 미리보기 화면과 발송 로그에 쓴다 */
        String summary
) {
    public static SourceChunk ok(SourceKind kind, String dataJson,
                                 Map<String, Object> metrics, String summary) {
        return new SourceChunk(kind, true, null, dataJson,
                metrics != null ? metrics : new LinkedHashMap<>(), summary);
    }

    /** 연결은 살아 있지만 그 구간에 수집할 내용이 없는 경우. 실패가 아니다. */
    public static SourceChunk empty(SourceKind kind, String summary) {
        return new SourceChunk(kind, true, null, null, new LinkedHashMap<>(), summary);
    }

    public static SourceChunk failed(SourceKind kind, String errorMessage) {
        return new SourceChunk(kind, false, errorMessage, null, new LinkedHashMap<>(),
                kind.name() + " 수집 실패 — 연결 확인 필요");
    }

    /** 연결 자체가 없어 건너뛴 경우 */
    public static SourceChunk notConnected(SourceKind kind) {
        return new SourceChunk(kind, true, null, null, new LinkedHashMap<>(), null);
    }

    public boolean hasData() {
        return success && dataJson != null && !dataJson.isBlank();
    }
}
