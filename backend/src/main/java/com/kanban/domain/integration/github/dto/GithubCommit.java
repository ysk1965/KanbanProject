package com.kanban.domain.integration.github.dto;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 수집한 커밋 하나. AI에 넣기 전의 원본이자, 보고서 페이지의 커밋 목록에 그대로 쓰인다.
 */
public record GithubCommit(
        String repoFullName,
        String sha,
        String message,
        String authorLogin,
        String authorName,
        OffsetDateTime committedAt,
        String htmlUrl,
        boolean merge,
        int changedFiles,
        int additions,
        int deletions,
        /** 변경 파일 경로(상세 조회 시에만 채워짐, 상위 일부). 기능-커밋 매칭의 핵심 신호. */
        List<String> files
) {
    public GithubCommit withStats(int changedFiles, int additions, int deletions, List<String> files) {
        return new GithubCommit(repoFullName, sha, message, authorLogin, authorName,
                committedAt, htmlUrl, merge, changedFiles, additions, deletions, files);
    }

    public String shortSha() {
        return sha != null && sha.length() > 8 ? sha.substring(0, 8) : sha;
    }

    /** 커밋 메시지 첫 줄. 본문은 AI 입력에서 잘라낸다 — 토큰만 먹고 요약에 보태는 게 적다. */
    public String subject() {
        if (message == null) {
            return "";
        }
        int newline = message.indexOf('\n');
        return (newline > 0 ? message.substring(0, newline) : message).trim();
    }

    /** 작성자 표시명 — login이 있으면 그쪽을 쓴다 (칸반 멤버 매칭에 유리) */
    public String displayAuthor() {
        return authorLogin != null && !authorLogin.isBlank() ? authorLogin : authorName;
    }

    /** null-safe 파일 목록 접근자. 상세 조회 전이면 빈 목록. */
    public List<String> filesOrEmpty() {
        return files != null ? files : List.of();
    }
}
