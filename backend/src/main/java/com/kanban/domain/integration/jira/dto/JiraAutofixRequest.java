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

    /** 러너가 claim·heartbeat에 실어 보내는 자기 소개. */
    @Getter @Setter @NoArgsConstructor
    public static class RunnerHello {
        private String runnerName;
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
