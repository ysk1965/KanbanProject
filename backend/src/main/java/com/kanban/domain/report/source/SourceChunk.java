package com.kanban.domain.report.source;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
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
        String summary,
        /**
         * 이 수집에서 우리 스토리지로 옮긴 파일의 S3 키. 보고서가 저장된 뒤 그 보고서 폴더로
         * 파일을 모으는 데 쓴다(수집 시점에는 보고서 id가 아직 없다). 옮긴 파일이 없으면 빈 목록.
         */
        List<String> collectedFileKeys
) {
    public static SourceChunk ok(SourceKind kind, String dataJson,
                                 Map<String, Object> metrics, String summary) {
        return ok(kind, dataJson, metrics, summary, List.of());
    }

    public static SourceChunk ok(SourceKind kind, String dataJson,
                                 Map<String, Object> metrics, String summary,
                                 List<String> collectedFileKeys) {
        return new SourceChunk(kind, true, null, dataJson,
                metrics != null ? metrics : new LinkedHashMap<>(), summary,
                collectedFileKeys != null ? List.copyOf(collectedFileKeys) : List.of());
    }

    /** 연결은 살아 있지만 그 구간에 수집할 내용이 없는 경우. 실패가 아니다. */
    public static SourceChunk empty(SourceKind kind, String summary) {
        return new SourceChunk(kind, true, null, null, new LinkedHashMap<>(), summary, List.of());
    }

    public static SourceChunk failed(SourceKind kind, String errorMessage) {
        return new SourceChunk(kind, false, errorMessage, null, new LinkedHashMap<>(),
                kind.name() + " 수집 실패 — 연결 확인 필요", List.of());
    }

    /** 연결 자체가 없어 건너뛴 경우 */
    public static SourceChunk notConnected(SourceKind kind) {
        return new SourceChunk(kind, true, null, null, new LinkedHashMap<>(), null, List.of());
    }

    public boolean hasData() {
        return success && dataJson != null && !dataJson.isBlank();
    }

    /**
     * 옮긴 파일 키를 덧붙인 사본. 주간 롤업이 "빠진 날 보충 수집"에서 옮긴 파일을 최종 청크에
     * 실어 보낼 때 쓴다 — 그러지 않으면 그 파일들이 어느 보고서 폴더에도 들어가지 못한다.
     */
    public SourceChunk withCollectedFileKeys(List<String> extraKeys) {
        if (extraKeys == null || extraKeys.isEmpty()) {
            return this;
        }
        List<String> merged = new ArrayList<>(collectedFileKeys);
        extraKeys.stream().filter(key -> !merged.contains(key)).forEach(merged::add);
        return new SourceChunk(kind, success, errorMessage, dataJson, metrics, summary, List.copyOf(merged));
    }
}
