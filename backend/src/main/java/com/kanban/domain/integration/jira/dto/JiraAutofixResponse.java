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
        /** 그중 사람이 맡긴 작업 수. 큐 앞자리를 차지하므로 따로 보인다. */
        private int queuedManual;
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
        /**
         * 원본 태스크가 이미 개발 단계를 지나 제외. 트리아지는 판정 시점 스냅샷이라
         * 그 뒤 완료/QA로 넘어간 이슈가 후보에 그대로 남는다 — 그걸 태우면 한도만 쓴다.
         */
        private int skippedAlreadyDone;
        private String repoFullName;
        private String baseRef;
    }

    @Getter @Builder @AllArgsConstructor
    public static class JobItem {
        private String id;
        /** 사람이 읽는 식별자. 접두사가 범위를 말한다 — QASA-40 / TASK-… / CHK-… */
        private String jobKey;
        /** JIRA / MANUAL. 화면이 출처 뱃지와 큐 우선순위 설명을 그리는 근거. */
        private String jobKind;
        /** 원본 BRIDGE 태스크. 화면에서 키를 눌러 카드를 열기 위한 값이다. */
        private String taskId;
        /** 위임 범위. null이면 태스크 전체, 값이 있으면 그 체크리스트 항목만. */
        private String checklistItemId;
        /**
         * 부모 태스크 제목. 체크리스트 위임은 항목 제목만으로 어느 카드 일인지 알 수 없어,
         * 도크가 보조 줄에 이 값을 쓴다.
         */
        private String parentTaskTitle;
        /** 위임된 대상의 제목(항목 제목 또는 태스크 제목). 목록의 첫 줄이 되는 값. */
        private String title;
        /** 사람이 쓴 지시문. 진행 중인 행에서만 펼쳐 보인다. */
        private String instruction;
        private String createdBy;
        private String createdByName;
        private String status;
        private Double confidence;
        private String repoFullName;
        private String branchName;
        private String runnerName;
        private String prUrl;
        private String failureReason;
        /** 에이전트 로그 꼬리. 실패 원인을 화면에서 볼 수 있는 유일한 경로다. */
        private String logExcerpt;
        private String queuedAt;
        private String dispatchedAt;
        private String completedAt;
    }

    /** 위임 결과. 항목을 여럿 고르면 job도 여럿이라 배열로 돌려준다. */
    @Getter @Builder @AllArgsConstructor
    public static class DelegateResult {
        private int queued;
        /** 이미 맡겨져 있어 건너뛴 대상 수. */
        private int skippedAlreadyDelegated;
        private String repoFullName;
        private String baseRef;
        private List<JobItem> jobs;
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

    /**
     * 러너가 한 건을 처리하는 데 필요한 전부. 러너는 이것 말고 BRIDGE에 더 묻지 않는다.
     *
     * <p><b>출처를 러너에게 알리지 않는다.</b> JIRA 이슈든 사람이 맡긴 태스크든 체크리스트 항목이든
     * {@code instruction} 한 덩어리로 나간다 — 맥락(부모 태스크 설명)과 범위 제한을 문장으로 만드는
     * 것은 전부 서버의 일이다. 러너에 출처별 분기가 생기면 프롬프트를 고칠 때마다 맥에 재배포해야
     * 하고, 안전장치도 두 벌이 된다. ({@code jobKind}는 로그·표시용으로만 싣는다.)
     */
    @Getter @Builder @AllArgsConstructor
    public static class RunnerJob {
        private String jobId;
        private String jobKey;
        private String jobKind;
        /** PR 제목이 되는 값. 체크리스트 위임이면 항목 제목이다 — 태스크 제목을 쓰면
         *  리뷰어가 카드 전체 변경을 기대하고 PR을 연다. */
        private String title;
        /** 서버가 조립한 프롬프트 본문(맥락 + 대상 + 지시). 러너는 제약 헤더만 덧붙인다. */
        private String instruction;
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

        /**
         * 원본 이슈 제목. 목록의 첫 줄이 되는 값이다 — 이게 없으면 화면에 남는 건 판정 근거뿐이라
         * "무슨 버그인지 모른 채 왜 자동화 가능한지만" 읽게 된다.
         */
        private String taskTitle;

        /** 원본 태스크의 현재 위치. 끝난 일이 후보에 섞여 보이는 문제를 푸는 값. null이면 연동이 끊긴 건. */
        private TaskState taskState;

        /** 이 태스크 체크리스트의 담당자들(사람 + 외주). 비어 있으면 미배정. */
        private List<Assignee> assignees;

        /**
         * 판정 이후 태스크가 수정됐는지. 이동·제목 변경 등 무엇이든 포함하므로
         * "판정이 낡았을 수 있다"는 신호로만 쓴다 — 이동 여부를 단정하지 않는다.
         */
        private boolean staleTriage;
    }

    /**
     * 태스크의 현재 위치. 블록은 보드마다 이름이 다르므로 이름·순서를 그대로 내려보내고,
     * 화면이 보드 순서대로 필터 칩을 만든다.
     */
    @Getter @Builder @AllArgsConstructor
    public static class TaskState {
        private String blockId;
        private String blockName;
        private Integer blockPosition;
        /** FEATURE / TASK / DONE — 고정 블록이 아니면 null. */
        private String blockFixedType;
        /** JIRA에서 pull된 QA 상태(REVIEW/VERIFIED/REJECTED). null이면 QA 흐름 밖. */
        private String qaState;
        private boolean completed;
        /**
         * 개발 단계를 이미 지났는지. 이름 추측이 아니라 확정 신호만 본다 —
         * 완료 체크 / Done 블록 / QA가 물고 있음(REVIEW·VERIFIED).
         * 반려(REJECTED)는 되레 자동수정이 필요한 상태라 제외한다.
         */
        private boolean alreadyDone;
    }

    /** 체크리스트 담당자 한 명. 외주는 보드 멤버가 아니라 색이 계약자 레코드에 있다. */
    @Getter @Builder @AllArgsConstructor
    public static class Assignee {
        private String id;
        private String name;
        /** 보드에서 지정한 색. 없으면 null이고 화면이 이름 해시로 정한다. */
        private String color;
        /** true면 외주(BoardContractor). 보드 멤버 필터와 섞이지 않게 구분한다. */
        private boolean external;
    }
}
