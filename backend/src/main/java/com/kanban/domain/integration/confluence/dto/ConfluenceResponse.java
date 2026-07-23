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
}
