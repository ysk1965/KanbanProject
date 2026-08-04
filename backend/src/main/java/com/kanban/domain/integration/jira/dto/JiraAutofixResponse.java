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
     * 셋업이 4단계라 하나만 빠져도 큐가 조용히 멈춘 것처럼 보인다.
     */
    @Getter @Builder @AllArgsConstructor
    public static class QueueStatus {
        /** 연결된 저장소. 없으면 null, 여러 개면 ambiguous가 true. */
        private String repoFullName;
        private boolean repoAmbiguous;
        /** 기본 브랜치에 워크플로가 있는지. 확인 실패 시 null(모름). */
        private Boolean workflowReady;
        private boolean callbackTokenSet;
        /** 자동 실행 여부. false면 큐에 담아도 아무 일이 없다. */
        private boolean schedulerEnabled;

        private int inFlight;
        private int queued;
        private int dispatchedToday;
        private int dailyLimit;
        private double minConfidence;
        /** 임계값을 넘어 지금 담을 수 있는 후보 수. */
        private int eligibleCandidates;
        private int totalCandidates;
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
        private String prUrl;
        private String runUrl;
        private String failureReason;
        private String queuedAt;
        private String dispatchedAt;
        private String completedAt;
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
