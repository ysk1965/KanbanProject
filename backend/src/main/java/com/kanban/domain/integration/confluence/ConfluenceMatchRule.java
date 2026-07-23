package com.kanban.domain.integration.confluence;

/**
 * 그 주의 주간보고 페이지를 찾아내는 기준.
 */
public enum ConfluenceMatchRule {
    /** 라벨로 찾는다 — 페이지가 옮겨 다녀도 깨지지 않아 가장 견고하다 */
    LABEL,
    /** 특정 부모 페이지의 자식 */
    PARENT_PAGE,
    /** 제목에 패턴이 포함된 페이지 */
    TITLE_PATTERN
}
