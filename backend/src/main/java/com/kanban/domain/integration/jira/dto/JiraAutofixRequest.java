package com.kanban.domain.integration.jira.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

public class JiraAutofixRequest {

    /** 큐 투입. 비우면 조건을 만족하는 후보 전부, 지정하면 그중에서만. */
    @Getter @Setter @NoArgsConstructor
    public static class Enqueue {
        private List<String> issueKeys;
    }

    /**
     * 사람이 직접 맡기는 작업.
     *
     * <p>{@code checklistItemIds}가 비면 태스크 전체, 채우면 <b>항목마다 job 하나씩</b> 만든다.
     * 하나로 묶지 않는 이유는 실패 단위가 섞이기 때문이다 — 3개 중 1개만 실패해도 PR 전체가
     * 실패로 남고 성공한 2개까지 버려진다.
     *
     * <p>지시문은 고른 항목 전체에 같은 문장이 들어간다. 항목마다 다른 지시가 필요하면 따로 맡긴다 —
     * 한 모달에서 항목마다 입력칸을 주면 3개를 고른 순간 화면이 폼 더미가 된다.
     */
    @Getter @Setter @NoArgsConstructor
    public static class Delegate {
        private String taskId;
        private List<String> checklistItemIds;
        private String instruction;
        /**
         * 사람이 방금 올린 스크린샷·재현 영상의 임시 키. 지시문과 함께 러너로 나가 에이전트가 직접 본다.
         *
         * <p>항목 여럿을 한 번에 맡겨도 파일은 <b>한 번만</b> 올린다 — 고른 항목 전부에 같은 자료가 붙는다.
         * 지시문을 항목마다 나누지 않는 것과 같은 이유다.
         */
        private List<String> fileKeys;
    }

    /**
     * 트리아지 실행 범위. 비우면 보드 전체(변경된 건만).
     *
     * <p>지정하면 그 이슈들만 무조건 다시 판정한다 — 전건 재판정은 AI 호출 비용이 커서
     * 아무도 누르지 않고, 결국 낡은 판정이 그대로 남는다.
     */
    @Getter @Setter @NoArgsConstructor
    public static class Triage {
        private List<String> issueKeys;
    }

    /** 러너가 claim·heartbeat에 실어 보내는 자기 소개. */
    @Getter @Setter @NoArgsConstructor
    public static class RunnerHello {
        private String runnerName;
        /**
         * 러너가 아는 작업 명세 계약 버전
         * ({@link com.kanban.domain.integration.jira.AutofixRunnerContract}).
         *
         * <p>nullable이다 — 이 필드가 생기기 전의 러너가 붙어 있을 수 있고, 그것 자체가
         * "낡았다"는 신호다. 없으면 불일치로 본다.
         */
        private Integer contractVersion;
        private RunnerStatus status;
    }

    /**
     * 러너 자가진단. 맥에 SSH로 들어가지 않고도 "왜 안 도는지"를 화면이 말할 수 있어야 한다 —
     * 러너가 조용한 이유는 대부분 큐가 아니라 맥 쪽 환경이다.
     *
     * <p>전부 nullable이다. 구버전 러너나 확인 실패는 "false"가 아니라 "모름"이고,
     * 모르는 것을 문제로 표시하면 화면이 거짓말을 한다.
     *
     * <p>필드 이름을 {@code @JsonProperty}로 못 박는다. 이 객체는 통신용이자 <b>저장 포맷</b>이라
     * 전역 네이밍 전략에 기대면 안 된다 — 전략이 바뀌는 순간 이미 저장된 행을 화면이 읽지 못한다.
     */
    @Getter @Setter @NoArgsConstructor
    public static class RunnerStatus {
        /** 프로젝트가 있는 볼륨의 여유 공간(GB). Library 재빌드가 반복되므로 처리량을 지배한다. */
        @JsonProperty("disk_free_gb")
        private Double diskFreeGb;
        /** Unity Editor 실행 여부. 꺼져 있어도 게이트는 돌지만 MCP 진단이 빠진다. */
        @JsonProperty("unity_running")
        private Boolean unityRunning;
        /** 프로젝트가 요구하는 에디터 버전이 설치돼 있는가. 없으면 검증이 통째로 실패한다. */
        @JsonProperty("unity_version_ok")
        private Boolean unityVersionOk;
        /** 검증 전용 클론이 준비됐는가(Library까지). 없으면 PR 직전에 매번 실패한다. */
        @JsonProperty("verify_ready")
        private Boolean verifyReady;
        /** gh 인증 여부. PR 생성 경로. */
        @JsonProperty("gh_authenticated")
        private Boolean ghAuthenticated;
        /** 작업 트리가 더러운가. 작업 중에는 당연히 true이므로 유휴일 때만 의미가 있다. */
        @JsonProperty("project_dirty")
        private Boolean projectDirty;
    }
}
