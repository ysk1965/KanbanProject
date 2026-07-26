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
     *
     * @deprecated 커밋-우선 개편 후 슬랙 미디어는 {@link Member}의 메시지 안으로 흡수된다.
     *             전환기 하위호환을 위해 필드는 유지한다.
     */
    @Deprecated
    private List<Attachment> attachments;

    /**
     * 커밋 클러스터. 커밋을 scope·파일경로·키워드로 <b>결정론적으로 군집화</b>한 뒤, 각 군집에 AI가
     * 제목·요약·신뢰도를 붙인다. 태스크·Confluence 문서는 키워드가 일치할 때만 부가로 붙는다.
     * 커밋-우선 개편에서 {@link #features}를 대체하는 "기능별 진행 현황"의 새 축이다.
     */
    private List<Cluster> clusters;

    /**
     * 구성원별 활동. 커밋(author)·슬랙(user)·Confluence(author)·칸반 체크리스트(assignee)를
     * <b>사람 기준으로 재묶은</b> 뷰. AI 없이 시스템이 결정론적으로 집계하며, 활동량 내림차순으로 정렬한다.
     */
    private List<Member> members;

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
        /**
         * 이 기능에서 그 기간에 실제로 무엇이 만들어졌는지 3~5문장으로 정리한 요약.
         * description(원본 이슈 설명)과 달리, 태스크·체크리스트·커밋·문서를 근거로 AI가 생성한다.
         * ReportComposer가 진행 집계 후(커밋 배정까지 끝난 뒤) 배치로 채운다. 실패하면 null.
         */
        private String summary;
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
        /**
         * 이 기능과 연관된 Confluence 문서. 그 기간에 추가/수정된 문서를 커밋과 같은 키워드 방식으로 매핑한다.
         * 삭제 문서는 제목만 온다(변경내역 규칙). 매칭 없으면 빈 목록.
         */
        private List<ConfluenceDoc> confluenceDocs;
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
        /**
         * 이 태스크의 체크리스트 항목(하위 작업). "무슨 작업인지"를 드러내고 커밋 매칭의 근거가 된다.
         * 최대 개수는 수집 단계에서 제한한다.
         */
        private List<ChecklistLine> checklist;
    }

    /** 체크리스트 항목 하나 — 태스크가 실제로 어떤 하위 작업들로 이뤄졌는지 보여준다. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChecklistLine {
        private String title;
        private boolean done;
        /** 담당자 표시 이름. 없으면 null. */
        private String assignee;
    }

    /** 기능에 연관된 Confluence 문서 하나(변경내역 기반). */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ConfluenceDoc {
        private String title;
        private String url;
        /** "added" | "modified" | "deleted" */
        private String changeType;
        /** 문서 작성/수정자 표시 이름. 없으면 null. */
        private String author;
        /** 마지막 수정 시각(ISO). 없으면 null. */
        private String updatedAt;
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

    /**
     * 슬랙에 공유된 이미지/영상 한 건.
     * <p>이미지: url은 우리 스토리지로 옮긴 주소라 로그인 없이 열린다.
     * <p>영상: url은 포스터 썸네일(없을 수 있음), link는 슬랙 원문 — 재생은 슬랙에서 한다.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Attachment {
        private String title;
        /** "image" | "video" */
        private String type;
        /** 이미지 원본 / 영상 포스터 썸네일. 영상은 썸네일이 없으면 null일 수 있다. */
        private String url;
        /** 영상 재생을 위한 슬랙 원문(permalink). 이미지는 null. */
        private String link;
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

    /**
     * 커밋 클러스터 하나. 커밋을 결정론적으로 묶은 군집이며, 어떤 신호로 묶였는지를 {@link #signals}로 드러내
     * 사람이 미스매칭을 눈으로 검증할 수 있게 한다. 제목·요약은 AI가, 나머지는 시스템이 채운다.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Cluster {
        /** 군집의 안정적 식별 키(scope 또는 경로). 정렬·중복 판단에 쓴다. */
        private String key;
        /** 사람이 읽을 제목. AI가 생성하며, 실패 시 key로 폴백한다. */
        private String title;
        /** 이 군집에서 그 기간 무엇이 만들어졌는지 2~4문장 요약. AI 생성, 실패 시 null. */
        private String summary;
        /** "HIGH" | "MID" — 붙은 결정론적 신호 개수 기반 신뢰도. */
        private String confidence;
        /** "infra"면 미분류·인프라 군집(기능 아님). 그 외 null. */
        private String kind;
        /** 무엇으로 묶였는지 — scope/path/keyword 신호. 검증용. */
        private List<ClusterSignal> signals;
        private List<FeatureCommit> commits;
        /** 키워드로 부착된 Confluence 문서. 매칭 없으면 빈 목록. */
        private List<ConfluenceDoc> confluenceDocs;
        /** 키워드로 부착된 칸반 태스크(+체크리스트). 매칭 없으면 빈 목록. */
        private List<FeatureTask> tasks;
        /** 부착된 태스크의 완료/전체 체크리스트 수. 없으면 0/0. */
        private int taskDone;
        private int taskTotal;
    }

    /** 클러스터가 어떤 신호로 묶였는지 한 건. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ClusterSignal {
        /** "scope" | "path" | "keyword" */
        private String kind;
        private String value;
    }

    /**
     * 구성원 한 명의 활동 묶음. 커밋·슬랙·문서·체크리스트를 사람 기준으로 모은다.
     * {@link #activity}는 정렬용 합계다.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Member {
        private String name;
        /** GitHub 로그인(없으면 슬랙 표시명 등 대체 식별자). */
        private String login;
        private int commitCount;
        private int slackCount;
        private int docCount;
        /** 담당자 뷰에 표시되는 체크리스트 수 = 지연 + 진행중 + 오늘 완료. */
        private int checklistCount;
        /** 지연(마감 지난 미완료) 건수. */
        private int lateCount;
        /** 진행중(곧 마감 예정인 미완료) 건수. */
        private int progressCount;
        /** 오늘(발송 직전 24시간) 완료 건수. */
        private int doneTodayCount;
        /** 오늘 이전에 이미 완료해 숨긴 건수 — "이전에 완료한 N건" 안내용. */
        private int hiddenCompletedCount;
        /** 네 소스 합계 — 활동량 내림차순 정렬 기준. */
        private int activity;
        private List<MemberCommit> commits;
        private List<MemberSlackMessage> slackMessages;
        private List<ConfluenceDoc> confluenceDocs;
        private List<MemberChecklistChange> checklistChanges;
    }

    /** 구성원 뷰의 커밋 한 건. 소속 클러스터 태그로 사람↔기능을 잇는다. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MemberCommit {
        private String subject;
        private String sha;
        private String at;
        private String url;
        /** feat/fix/refactor/chore/... */
        private String type;
        /** 이 커밋이 속한 클러스터 키(미분류면 null). */
        private String clusterKey;
        /** 표시용 클러스터 제목(미분류면 null). */
        private String clusterTitle;
    }

    /** 구성원 뷰의 슬랙 메시지 한 건(+첨부 미디어). */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MemberSlackMessage {
        private String channel;
        private String text;
        private String at;
        /** 이 메시지에 붙은 이미지/영상. 없으면 빈 목록. */
        private List<Attachment> media;
    }

    /** 구성원 뷰의 칸반 체크리스트 변경 한 건. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MemberChecklistChange {
        private String title;
        private boolean done;
        /** 이 항목이 속한 태스크/기능 이름(맥락 표시용). 없으면 null. */
        private String context;
        /** 버킷 구분: "late"(지연) · "progress"(진행중) · "done"(오늘 완료). */
        private String status;
        /** 마감일(ISO yyyy-MM-dd). 없으면 null. */
        private String dueDate;
        /** 지연 항목의 경과 일수(오늘 − 마감). 지연이 아니면 0. */
        private int overdueDays;
    }
}
