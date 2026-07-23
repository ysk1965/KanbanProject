package com.kanban.domain.integration.confluence.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

public class ConfluenceRequest {

    /** 접근 가능한 사이트 중 하나를 고른다 */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SelectSite {
        @NotBlank
        private String cloudId;
        private String baseUrl;
        private String siteName;
    }

    /** 이 보드가 볼 스페이스와 주간보고 식별 규칙 — 전달된 목록으로 통째 교체 */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SelectSpaces {
        private List<SpaceSelection> spaces;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SpaceSelection {
        @NotBlank
        private String spaceKey;
        private String spaceName;
        /** LABEL(기본) | PARENT_PAGE | TITLE_PATTERN */
        private String matchRule;
        private String label;
        private String parentPageId;
        private String titlePattern;
    }
}
