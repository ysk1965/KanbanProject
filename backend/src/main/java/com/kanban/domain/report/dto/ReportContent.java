package com.kanban.domain.report.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * AI가 내놓는 보고서 본문의 고정 스키마.
 *
 * <p>슬랙 요약과 웹 페이지가 <b>이 한 벌에서 함께</b> 나온다. 산문 한 덩어리로 받으면
 * 슬랙용 요약을 만들려고 AI를 한 번 더 불러야 한다.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReportContent {

    /** 한 줄 요약. 슬랙 메시지의 첫 줄이자 페이지의 제목 아래 리드 문장. */
    private String headline;

    /** 리드 문단 — 페이지에만 쓴다. */
    private String lede;

    /** 지표 카드. 값은 수집 단계에서 계산한 숫자를 그대로 쓴다(AI가 지어내지 않게). */
    private List<Metric> metrics;

    /** 슬랙에 나가는 3줄. 페이지에서는 "주요 변화"로 쓴다. */
    private List<String> highlights;

    /** 본문 섹션. 일일은 1~2개, 주간은 성과/진행 중/리스크/다음 주 계획 4개. */
    private List<Section> sections;

    /** 확인이 필요한 것들. 앰버로 분리해 표시한다. */
    private List<String> risks;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Metric {
        private String label;
        private String value;
        /** 전 기간 대비 변화 등 부가 설명 */
        private String delta;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Section {
        private String title;
        private String body;
        /** 이 섹션이 어느 소스에서 나왔는지 — GITHUB / KANBAN / CONFLUENCE */
        private List<String> sources;
    }
}
