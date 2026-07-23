package com.kanban.domain.integration.github.dto;

/** 설치에 포함된 저장소. 보드 설정 화면의 체크박스 목록에 그대로 내려간다. */
public record GithubRepoRef(
        String fullName,
        String name,
        String defaultBranch,
        boolean isPrivate,
        String htmlUrl
) {
}
