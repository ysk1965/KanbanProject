package com.kanban.domain.report.source;

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
}
