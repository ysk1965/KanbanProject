package com.kanban.domain.ai.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 커밋 플랜 생성 요청. Unity 에디터 툴({@code MilkywayAiDraft.cs})이 보내는 계약이다.
 *
 * <p>필드명이 모두 한 단어라 Jackson {@code SNAKE_CASE} 전략에서도 그대로 유지된다.
 */
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class CommitPlanRequest {

    /**
     * 클라이언트가 경로 규칙(Path Map)으로 1차 분할한 결정론 결과.
     * <b>이 분할이 기준</b>이고 AI는 정제만 한다. 비어 있으면 400.
     */
    private List<Group> groups;

    /** 경로 규칙으로 소속을 정하지 못한 파일들. */
    private List<String> unmapped;

    /** git diff 요약 텍스트 (클라이언트가 12k자로 절단해서 보낸다). */
    private String diff;

    /** {@code commit-scopes.md} 원문 — scope 사전 + Path Map. */
    private String scopes;

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Group {
        private String scope;
        private List<String> files;
    }
}
