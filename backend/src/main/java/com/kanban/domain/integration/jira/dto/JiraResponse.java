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
        private String authType;            // API_TOKEN / OAUTH_3LO
        private boolean needsSiteSelection; // OAuth인데 사이트/프로젝트 미확정
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

    /** OAuth 인증 URL. */
    @Getter @Builder @AllArgsConstructor
    public static class OAuthUrl {
        private String oauth_url;
    }

    /** OAuth로 접근 가능한 JIRA 사이트 (accessible-resources). */
    @Getter @Builder @AllArgsConstructor
    public static class SiteRef {
        private String cloud_id;
        private String url;
        private String name;
    }

    /** 가져오기 결과 요약. preview=true면 items로 상세 미리보기 동봉. */
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
        private String milestoneName;      // 자동 배정될 현재 마일스톤 (preview 전용, nullable)
        private List<PreviewItem> items;   // preview 전용 상세 목록 (실제 가져오기 시 null)
        private List<String> errors;
    }

    /** 미리보기 항목 — 이슈 1건이 BRIDGE에서 무엇이 되는지. */
    @Getter @Builder @AllArgsConstructor
    public static class PreviewItem {
        private String key;             // "QASA-2"
        private String summary;         // 제목
        private String targetType;      // "FEATURE"(에픽) / "TASK"
        private String blockName;       // Task가 들어갈 블록 이름 (Task만)
        private String assigneeName;    // JIRA 담당자 표시 이름 (nullable)
        private boolean assigneeMatched;// BRIDGE 멤버로 매칭되는지
        private String parentKey;       // 상위 에픽 키 (nullable)
        private int attachmentCount;    // 첨부 → 댓글로 이관될 개수
        private boolean skipped;         // 이미 가져와서 건너뜀
        private String skipReason;       // 스킵 사유 (nullable)
    }
}
