package com.kanban.domain.integration.jira.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Map;

public class JiraRequest {

    /** 연결 (Step 1). */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Connect {
        private String baseUrl;       // cookapps-interactive.atlassian.net
        private String cloudId;       // 선택 (OAuth v2용)
        private String projectKey;    // QASA
        private String accountEmail;  // Basic 인증 계정
        private String apiToken;      // 원문 (서버가 암호화 저장)
        private String jql;           // 선택 범위 필터
    }

    /** 매핑 규칙 (Step 2). key=JIRA 값, value=BRIDGE 대상. */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Mapping {
        private Map<String, String> statusToBlock;    // {"1. 할 일": blockId}
        private Map<String, String> priorityToTag;    // {"Normal": tagId}
        private Map<String, String> componentToTag;   // {"QA": tagId}
        private boolean milestoneAutoAssign;
    }

    /** 완료 역동기화 설정. */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WriteBack {
        private boolean enabled;
        private String targetStatusId;   // "10007" = "3. 작업 완료"
    }

    /** 가져오기 실행 (Step 3). */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Import {
        private String jql;      // 선택 override (없으면 config.jql 또는 project=KEY)
        private boolean preview; // true면 건수만 계산
    }

    /** OAuth 사이트/프로젝트 확정. */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Finalize {
        private String cloudId;
        private String baseUrl;
        private String projectKey;
    }
}
