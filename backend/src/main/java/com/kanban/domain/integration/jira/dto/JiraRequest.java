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

    /**
     * 블록 ↔ JIRA status 양방향 매핑 저장.
     * key=blockId 또는 "__rejected", value={ jira_status_id, dir(push|pull), qa, return_block_id }.
     */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BlockStatusMapping {
        private Map<String, Map<String, String>> blockStatusMap;
    }

    /** 완료 역동기화 설정. */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WriteBack {
        private boolean enabled;
        private String targetStatusId;   // "10007" = "3. 작업 완료"
    }

    /** 댓글 양방향 동기화 on/off. */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CommentSync {
        private boolean enabled;
    }

    /** 가져오기 실행 (Step 3). */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Import {
        private String jql;      // 선택 override (없으면 config.jql 또는 project=KEY)
        private boolean preview; // true면 건수만 계산
    }

    /** 마일스톤 스코프 저장 — 이 마일스톤의 JIRA 뷰가 비출 범위(JQL). */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MilestoneScopeSave {
        private String jql;   // 예: fixVersion = "소프트런칭"
    }

    /** 미러 대상 Agile 보드 선택. 빈 값이면 자동 선택으로 복귀. */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AgileBoardSelect {
        private String agileBoardId;   // JIRA Agile 보드 id (예: "83")
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
