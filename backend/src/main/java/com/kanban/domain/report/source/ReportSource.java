package com.kanban.domain.report.source;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

/**
 * 보고서 재료를 모으는 커넥터. 스케줄러는 어떤 구현체가 붙어 있는지 몰라도 된다.
 *
 * <p>새 소스(Jira, Figma 등)를 추가할 때 구현체만 늘리면 되도록,
 * 수집 실패는 예외가 아니라 {@link SourceChunk#failed}로 표현한다.
 */
public interface ReportSource {

    SourceKind kind();

    /** 이 보드에 연결과 대상이 모두 설정돼 있는가 */
    boolean isConfigured(String boardId);

    SourceChunk collect(String boardId, ReportPeriod period);

    /**
     * 주간 보고서를 만들 때 원본 API를 7일치 다시 긁는 대신, 그 주에 이미 발행된 일일 보고서의
     * 수집분({@code data_snapshot})을 재활용할 수 있는가.
     *
     * <p>커밋·메시지·문서 변경처럼 <b>시간에 따라 쌓이기만 하는(누적형)</b> 소스는 일일 조각을
     * 이어붙이면 그 주 전체가 되므로 {@code true}. 반대로 칸반처럼 <b>그 순간의 상태(스냅샷)</b>인
     * 소스는 조각을 더한다는 게 성립하지 않아 {@code false}(주간에 원본을 새로 수집)로 둔다.
     */
    default boolean supportsWeeklyRollup() {
        return false;
    }

    /**
     * 일일 수집분 여러 개를 주간 한 벌로 합친다. 각 원소는 이 소스가 {@link #collect}에서 만든
     * {@code dataJson}과 동일한 구조의 JSON이다(일일 보고서 스냅샷에서 꺼낸 것이거나, 일일이 없던
     * 날을 위해 그 하루만 새로 수집한 것). 중복은 소스가 자기 키(커밋 sha 등)로 제거한다.
     *
     * <p>{@link #supportsWeeklyRollup()}이 {@code true}인 구현체만 호출된다. 입력이 비면 호출부가
     * 걸러 주므로 여기선 최소 1개가 보장된다.
     */
    default SourceChunk rollup(List<JsonNode> dailyData, ReportPeriod period) {
        throw new UnsupportedOperationException(kind() + " 소스는 주간 롤업을 지원하지 않습니다");
    }
}
