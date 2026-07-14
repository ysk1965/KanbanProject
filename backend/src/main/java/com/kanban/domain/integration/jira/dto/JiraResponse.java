package com.kanban.domain.integration.jira.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

public class JiraResponse {

    @Getter @Builder @AllArgsConstructor
    public static class Status {
        private String boardId;
        private boolean connected;
        private String baseUrl;
        private String projectKey;
        private String jql;
        private String status;              // CONNECTED / ERROR / DISCONNECTED
        private String lastSyncedAt;
        private String lastError;
        private boolean milestoneAutoAssign;
        private boolean writeBackEnabled;
        private String writeBackTargetStatusId;
        private String connectedByName;
    }

    @Getter @Builder @AllArgsConstructor
    public static class TestResult {
        private boolean success;
        private String message;
        private String projectName;
    }

    /** 매핑 UI용 메타 (JIRA 상태 목록 등). */
    @Getter @Builder @AllArgsConstructor
    public static class Meta {
        private List<NameRef> statuses;
    }

    @Getter @Builder @AllArgsConstructor
    public static class NameRef {
        private String id;
        private String name;
    }

    /** 가져오기 결과 요약. */
    @Getter @Builder @AllArgsConstructor
    public static class ImportResult {
        private int total;        // 대상 이슈 수
        private int created;      // 신규 생성
        private int updated;      // 갱신
        private int skipped;      // 스킵
        private int features;
        private int tasks;
        private int checklists;
        private int comments;
        private List<String> errors;
    }
}
