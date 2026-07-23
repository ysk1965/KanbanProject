package com.kanban.domain.integration.github.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

public class GithubResponse {

    /** 보드 설정의 GitHub 카드가 그리는 데 필요한 전부 */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Status {
        /** CONNECTED | TARGET_NOT_SELECTED | DISCONNECTED, 미연결이면 null */
        private String status;
        private boolean connected;
        private String accountLogin;
        /** BOARD | ORGANIZATION — 조직 연결이면 다른 보드도 재인증 없이 쓴다 */
        private String scope;
        private String installationId;
        private List<SelectedRepo> selectedRepos;
        private String lastError;
        /** 서버에 App 자격증명이 없으면 연결 버튼 자체를 막아야 한다 */
        private boolean appConfigured;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SelectedRepo {
        private String repoFullName;
        private String branch;
        private List<String> excludeAuthors;
        private boolean active;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AvailableRepo {
        private String fullName;
        private String name;
        private String defaultBranch;
        private boolean isPrivate;
        private String htmlUrl;
        /** 이 보드가 이미 고른 저장소인지 */
        private boolean selected;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class InstallUrl {
        private String url;
    }
}
