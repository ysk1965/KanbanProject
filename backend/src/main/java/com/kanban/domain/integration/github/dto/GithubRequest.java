package com.kanban.domain.integration.github.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

public class GithubRequest {

    /** 설치 완료 후 GitHub이 돌려준 installation_id를 보드에 붙인다. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LinkInstallation {
        @NotBlank
        private String installationId;
        /** true면 보드가 속한 조직 전체에서 재사용한다 (기본값). 조직이 없으면 무시된다. */
        private Boolean shareWithOrganization;
    }

    /** 이 보드가 볼 저장소 선택 — 전달된 목록으로 통째로 교체한다. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SelectRepos {
        private List<RepoSelection> repos;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RepoSelection {
        @NotBlank
        private String repoFullName;
        /** null이면 저장소 기본 브랜치 */
        private String branch;
        /** 봇 계정 등 보고서에서 뺄 작성자 로그인 */
        private List<String> excludeAuthors;
    }
}
