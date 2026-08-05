package com.kanban.domain.integration.jira.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

public class JiraAutofixResponse {

    /** 트리아지 실행 결과. Step 1의 목적은 이 숫자를 얻는 것이다. */
    @Getter @Builder @AllArgsConstructor
    public static class TriageRun {
        /** 보드에서 발견한 JIRA 연동 태스크 총 수. */
        private int scanned;
        /** 이번 실행에서 실제로 AI 판정을 돌린 건수. */
        private int triaged;
        /** 직전 판정 이후 이슈가 안 바뀌어 건너뛴 건수. */
        private int skipped;
        /** 실패한 배치 수. 0이 아니면 summary가 부분 결과다. */
        private int failedBatches;
        private Summary summary;
    }

    /** 보드 전체 누적 집계. */
    @Getter @Builder @AllArgsConstructor
    public static class Summary {
        private int total;
        private int candidate;
        private int conditional;
        private int excluded;
        /** 후보 비율(%) — 2단계 투자 여부를 가르는 숫자. */
        private double candidateRatio;
        private List<CategoryCount> categories;
    }

    @Getter @Builder @AllArgsConstructor
    public static class CategoryCount {
        private String category;
        private int candidate;
        private int conditional;
        private int excluded;
        private int total;
    }

    /**
     * 큐 준비 상태 + 현재 현황. 화면이 "왜 시작할 수 없는지"를 스스로 설명할 수 있어야 한다 —
     * 셋업이 3단계라 하나만 빠져도 큐가 조용히 멈춘 것처럼 보인다.
     */
    @Getter @Builder @AllArgsConstructor
    public static class QueueStatus {
        /** 연결된 저장소. 없으면 null, 여러 개면 ambiguous가 true. */
        private String repoFullName;
        private boolean repoAmbiguous;
        /** 최근에 러너가 말을 걸어왔는지. false면 맥이 잠들었거나 데몬이 죽은 것이다. */
        private boolean runnerOnline;
        private String runnerName;
        /** 마지막으로 러너를 본 시각. 오프라인일 때 "언제부터"를 말해주기 위해 항상 내려준다. */
        private String runnerSeenAt;
        /**
         * 러너 자가진단 스냅샷(디스크·에디터·검증 클론 등). 러너가 아직 안 보냈으면 null.
         *
         * <p>필드가 늘어나도 서버 DTO를 고치지 않도록 그대로 통과시킨다 — 어차피 저장 시점에
         * 서버가 아는 필드만 걸러 두었다.
         */
        private com.fasterxml.jackson.databind.JsonNode runnerStatus;
        private boolean callbackTokenSet;
        /** 작업을 내줄지 여부. false면 큐에 담아도 러너가 가져가지 못한다. */
        private boolean dispatchEnabled;

        private int inFlight;
        private int queued;
        private int dispatchedToday;
        private int dailyLimit;
        private double minConfidence;
        /** 임계값을 넘어 지금 담을 수 있는 후보 수. */
        private int eligibleCandidates;
        private int totalCandidates;

        /**
         * 결과를 게시할 자동수정 전용 슬랙 채널. 지정하지 않았으면 null이고, 그때는 설치
         * 기본 채널로 나간다 — 화면이 "어디로 나가는지 모르는" 상태를 만들지 않으려면
         * 둘을 구분해 보여줘야 한다.
         */
        private String slackChannelId;
        private String slackChannelName;
        /** 서버에서 자동수정 슬랙 알림 자체가 꺼져 있으면 채널을 골라도 나가지 않는다. */
        private boolean slackNotifyEnabled;
    }

    /** 큐 투입 결과. 건너뛴 이유를 나눠 보여줘야 왜 적게 담겼는지 알 수 있다. */
    @Getter @Builder @AllArgsConstructor
    public static class EnqueueResult {
        private int queued;
        /** confidence 임계값 미달로 제외. */
        private int skippedLowConfidence;
        /** 이미 작업이 있는 이슈라 제외(이슈당 1회). */
        private int skippedAlreadyQueued;
        private String repoFullName;
        private String baseRef;
    }

    @Getter @Builder @AllArgsConstructor
    public static class JobItem {
        private String id;
        private String jiraIssueKey;
        private String status;
        private Double confidence;
        private String repoFullName;
        private String runnerName;
        private String prUrl;
        private String failureReason;
        /** 에이전트 로그 꼬리. 실패 원인을 화면에서 볼 수 있는 유일한 경로다. */
        private String logExcerpt;
        private String queuedAt;
        private String dispatchedAt;
        private String completedAt;
    }

    /**
     * claim 응답. 내줄 게 없어도 200으로 이유를 돌려준다 — 204만 오면 러너 로그에
     * "왜 조용한지"가 남지 않아 맥 앞에 앉기 전까지 원인을 알 수 없다.
     */
    @Getter @Builder @AllArgsConstructor
    public static class ClaimResult {
        /** 가져갈 작업. 없으면 null. */
        private RunnerJob job;
        /** CLAIMED / EMPTY / IN_FLIGHT / DAILY_LIMIT / DISPATCH_DISABLED / NO_TARGET */
        private String reason;

        public static ClaimResult of(RunnerJob job, String reason) {
            return ClaimResult.builder().job(job).reason(reason).build();
        }
    }

    /** 러너가 한 건을 처리하는 데 필요한 전부. 러너는 이것 말고 BRIDGE에 더 묻지 않는다. */
    @Getter @Builder @AllArgsConstructor
    public static class RunnerJob {
        private String jobId;
        private String jiraIssueKey;
        private String issueTitle;
        private String issueBody;
        /** 트리아지가 판정한 검증 수단. 에이전트 프롬프트에 그대로 들어간다. */
        private String verification;
        /** 저장소 검증 기반 수준(NONE/PARTIAL/MATURE). 테스트를 써도 되는지 판단 근거. */
        private String testInfra;
        private String repoFullName;
        private String baseRef;
        /** 서버가 정한 작업 브랜치 이름 — 러너가 정하면 실행마다 규칙이 흔들린다. */
        private String branch;
        /** 러너가 한 건에 쓸 수 있는 시간. 서버의 회수 시각보다 반드시 짧다. */
        private int timeoutMinutes;
        /**
         * 이슈 댓글. QA 이슈는 재현 절차와 추가 조건이 본문이 아니라 댓글에 이어지는 경우가 많다 —
         * 제목과 본문만 주면 에이전트가 절반만 보고 판단하게 된다.
         */
        private List<IssueComment> comments;
        /**
         * 스크린샷·영상. 파일은 싣지 않고 URL만 준다 — 스크린샷 몇 장이면 작업 명세 JSON이
         * 수 MB가 되고, 그 JSON은 로그에도 남는다. 러너가 필요한 것만 직접 받는다.
         */
        private List<Material> materials;
    }

    /** 러너에게 넘기는 댓글 한 줄. */
    @Getter @Builder @AllArgsConstructor
    public static class IssueComment {
        private String author;
        private String createdAt;
        private String body;
    }

    /**
     * 에이전트가 볼 자료 한 건.
     *
     * <p>URL은 BRIDGE가 이미 S3에 올려 둔 공개 주소다. 지라에서 다시 받아오지 않는 이유는,
     * 그러려면 지라 자격증명이 맥까지 내려가야 하기 때문이다 — 러너가 들고 있어야 할 비밀은
     * 콜백 토큰 하나로 끝나야 한다.
     */
    @Getter @Builder @AllArgsConstructor
    public static class Material {
        private String filename;
        private String mimeType;
        private Long size;
        private String url;
    }

    @Getter @Builder @AllArgsConstructor
    public static class TriageItem {
        private String jiraIssueKey;
        private String taskId;
        private String verdict;
        private String category;
        private Double confidence;
        private String verification;
        private String reason;
        private String triagedAt;
    }
}
