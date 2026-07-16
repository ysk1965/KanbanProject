package com.kanban.domain.integration.jira.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;
import java.util.Map;

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
        /** 블록↔status 양방향 매핑 (key=blockId/__rejected). 매핑 UI 초기값. */
        private Map<String, Map<String, String>> blockStatusMap;
        /** 웹훅 수신 토큰(Phase 4). FE가 웹훅 URL을 조립해 안내. */
        private String webhookToken;
        private String connectedByName;
        /** 동기화 방식 MANUAL/MIRROR. 신규 UI는 MIRROR만 노출. */
        private String syncMode;
        /** 미러 준비 완료 여부(MIRROR + 상태별 블록 생성됨). 가이드/JIRA뷰 진입 판단용. */
        private boolean mirrorReady;
        /** 미러 대상으로 선택된 JIRA Agile 보드 id (null=자동선택). 보드 드롭다운 초기값. */
        private String agileBoardId;
    }

    /** 프로젝트의 JIRA Agile 보드 (미러 대상 선택 드롭다운용). */
    @Getter @Builder @AllArgsConstructor
    public static class AgileBoard {
        private String id;
        private String name;
        private String type;       // kanban / scrum / simple
        private boolean selected;  // 현재 미러 대상으로 선택됨
    }

    /** 미러 셋업 결과 — 생성/재사용된 미러 컬럼 수. */
    @Getter @Builder @AllArgsConstructor
    public static class MirrorSetup {
        private int columns;   // 미러 컬럼 총 개수
        private int created;   // 신규 생성
        private int reused;    // 기존 블록 재사용
        private Status status; // 갱신된 연동 상태
    }

    /** pre-block용 — 특정 태스크(=JIRA 이슈)에서 전환 가능한 대상 상태 id 목록. */
    @Getter @Builder @AllArgsConstructor
    public static class Transitions {
        private String taskId;
        private String currentStatusId;
        private List<String> allowedStatusIds;  // 이 카드가 드롭 가능한 JIRA 상태 id들
    }

    @Getter @Builder @AllArgsConstructor
    public static class TestResult {
        private boolean success;
        private String message;
        private String projectName;
    }

    /** 매핑 UI용 메타 (JIRA 상태 목록 + BRIDGE 블록 목록). */
    @Getter @Builder @AllArgsConstructor
    public static class Meta {
        private List<NameRef> statuses;
        private List<BlockRef> blocks;   // 매핑 UI 좌측(BRIDGE 블록)
    }

    @Getter @Builder @AllArgsConstructor
    public static class NameRef {
        private String id;
        private String name;
    }

    /** 매핑 UI용 BRIDGE 블록 (Feature 블록 제외). */
    @Getter @Builder @AllArgsConstructor
    public static class BlockRef {
        private String id;
        private String name;
        private String fixedType;   // TASK / SPRINT / DONE / CUSTOM 등 (nullable)
        private String jiraStatusId; // 미러 컬럼이면 대표(primary) JIRA 상태 id (nullable)
        private List<String> jiraStatusIds; // 미러 컬럼에 묶인 JIRA 상태 id 전체 (카드 배치용)
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
        private boolean willUpdate;      // 기존 Task를 JIRA 최신값으로 갱신 예정
    }
}
