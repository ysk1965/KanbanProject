package com.kanban.domain.integration.confluence.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

public class ConfluenceResponse {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OAuthUrl {
        private String oauthUrl;
    }

    /** 이 토큰으로 열 수 있는 Atlassian 사이트 — JIRA 사이트와 다를 수 있다 */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SiteRef {
        private String cloudId;
        private String url;
        private String name;
        /** Confluence 스코프가 이 사이트에 부여됐는지. false면 골라도 열리지 않는다. */
        private boolean confluenceAvailable;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SpaceRef {
        private String key;
        private String name;
        private String type;
    }

    /** 보드 설정의 Confluence 카드가 그리는 데 필요한 전부 */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Status {
        private String status;
        private boolean connected;
        private String siteName;
        private String baseUrl;
        private String cloudId;
        private String authType;
        private List<SelectedSpace> spaces;
        private String lastError;
        private boolean appConfigured;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SelectedSpace {
        private String spaceKey;
        private String spaceName;
        private String matchRule;
        private String label;
        private String parentPageId;
        private String titlePattern;
        private boolean active;
    }

    /** 수집된 주간보고 페이지 한 건 */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PageRef {
        private String id;
        private String title;
        private String url;
        private String lastUpdated;
    }

    /**
     * 트리 변경 수집에 필요한 페이지 상세. 생성 시각으로 추가/수정을 가르고,
     * 버전으로 편집 여부를, storage 본문으로 내용을 담는다.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PageDetail {
        private String id;
        private String title;
        /** 문서가 처음 만들어진 시각 (ISO-8601). 이 값이 기간 안이면 '추가'. */
        private String createdAt;
        /** 현재 버전 번호 */
        private Integer versionNumber;
        /** 현재 버전이 만들어진(마지막 편집) 시각 */
        private String versionCreatedAt;
        /** 마지막 편집자 accountId */
        private String authorId;
        /** storage 포맷(XHTML) 원문 */
        private String storageBody;
        /** 웹 UI 경로 (baseUrl 상대) */
        private String webUrl;
    }

    /**
     * Atlassian 사용자 한 명. 문서 작성자를 사람 이름으로 바꾸는 데 쓴다.
     *
     * <p>{@link #email}은 <b>없을 수 있다</b> — Atlassian 프라이버시 설정에 따라 응답에서
     * 빠지는 게 정상이다. 그래서 매칭은 이메일을 <i>질의</i>로 넣어 찾는 방향으로만 하고,
     * 응답의 email에 의존하지 않는다.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UserRef {
        private String accountId;
        private String displayName;
        /** 응답에 실렸을 때만 채워진다. null이 흔하다. */
        private String email;
    }
}
