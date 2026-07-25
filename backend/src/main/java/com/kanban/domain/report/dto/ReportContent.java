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

    /** 슬랙에 나가는 주요 항목(중요도 순, 최대 10개). 페이지에서는 "주요 변화"로 쓴다. */
    private List<String> highlights;

    /** 본문 섹션. 일일은 1~2개, 주간은 성과/진행 중/리스크/다음 주 계획 4개. */
    private List<Section> sections;

    /** 확인이 필요한 것들. 앰버로 분리해 표시한다. */
    private List<String> risks;

    /**
     * 활성 스프린트 진행 현황. AI가 아니라 시스템이 스프린트 도메인에서 집계한다(metrics와 동일 원칙).
     * 활성 스프린트가 없으면 null.
     */
    private Sprint sprint;

    /**
     * 기능(feature)별 진행 현황. AI가 아니라 시스템이 feature/task 도메인에서 집계한다.
     * 진행 중 feature + 기간 내 완료된 feature를 담는다.
     */
    private List<Feature> features;

    /**
     * 어느 기능에도 연결되지 않은 나머지 커밋을 유형(fix/refactor/chore…)별로 묶은 카테고리.
     * 기능 탭 옆의 "기타 커밋" 탭에 쓰인다.
     */
    private List<CommitCategory> commitCategories;

    /**
     * 슬랙 채널에 공유된 이미지·영상. AI가 아니라 시스템이 슬랙 수집 결과에서 모아 우리 스토리지로 옮긴
     * URL을 담는다. 페이지에서 "공유된 자료" 갤러리로 보여준다.
     */
    private List<Attachment> attachments;

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

    /** 활성 스프린트의 스코프 게이지. 값은 스프린트 도메인(체크리스트 항목) 집계다. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Sprint {
        private String name;
        /** 이 스프린트가 속한 마일스톤 이름(제목). 스프린트는 마일스톤에 필수로 속한다. */
        private String milestone;
        /** 스프린트 상태 — 활성은 "IN_PROGRESS" */
        private String status;
        private int done;
        private int total;
        private int inProgress;
        private int delayed;
        private int percentage;
    }

    /** 기능 하나의 진행 현황. 진행률·담당자·태스크는 feature/task 도메인에서 그대로 가져온다. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Feature {
        private String name;
        /** "DONE" | "IN_PROGRESS" (feature 도메인엔 REVIEW 없음) */
        private String status;
        private String description;
        private int taskDone;
        private int taskTotal;
        private List<String> assignees;
        /** 마지막 활동 시각(ISO). 태스크 완료 시각의 최댓값 등. */
        private String lastActivity;
        private List<FeatureTask> tasks;
        /**
         * 이 기능에 연결된 GitHub 커밋. 담당자(연결된 github_login)·활동 기간·키워드 기준으로 추정 매핑한다.
         * 커밋마다 estimated 플래그로 확정/추정을 구분한다.
         */
        private List<FeatureCommit> commits;
    }

    /** 기능에 속한 개별 태스크(펼치기 목록용). */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FeatureTask {
        private String title;
        /** "DONE" | "IN_PROGRESS" | "TODO" */
        private String status;
    }

    /** 기능/카테고리에 연결된 커밋 하나. GitHub 수집 결과에서 표시에 필요한 필드만 담는다. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FeatureCommit {
        private String repo;
        private String sha;
        private String subject;
        private String author;
        private String at;
        private String url;
        private Integer changedFiles;
        /** 커밋 메시지 접두어로 판별한 유형 — feat/fix/refactor/chore/docs/test/other */
        private String type;
        /** true면 담당자 확정이 아니라 키워드/AI로 추정 연결된 커밋 */
        private boolean estimated;
    }

    /** 슬랙에 공유된 이미지/영상 한 건. url은 우리 스토리지로 옮긴 주소라 로그인 없이 열린다. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Attachment {
        private String title;
        /** "image" | "video" */
        private String type;
        private String url;
    }

    /** 기능에 매핑되지 않은 커밋을 유형별로 묶은 카테고리. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CommitCategory {
        /** "fix" | "refactor" | "chore" | "feat" | "docs" | "other" */
        private String key;
        /** 표시 라벨 — "버그 수정" 등 */
        private String label;
        private List<FeatureCommit> commits;
    }
}
