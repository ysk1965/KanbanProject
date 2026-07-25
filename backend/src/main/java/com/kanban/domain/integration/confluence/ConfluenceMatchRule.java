package com.kanban.domain.integration.confluence;

/**
 * 그 주의 주간보고 페이지를 찾아내는 기준.
 */
public enum ConfluenceMatchRule {
    /** 라벨로 찾는다 — 페이지가 옮겨 다녀도 깨지지 않아 가장 견고하다 */
    LABEL,
    /** 특정 부모 페이지의 <b>직속</b> 자식 */
    PARENT_PAGE,
    /** 제목에 패턴이 포함된 페이지 */
    TITLE_PATTERN,
    /**
     * 부모 페이지 하나를 잡고 그 <b>하위 트리 전체</b>에서 기간 내 변경(추가·수정·삭제)만 모은다.
     * 단일 문서 스냅샷이 아니라 "이 프로젝트 문서들이 이번 기간에 어떻게 변했나"를 수집한다.
     */
    PARENT_TREE_CHANGELOG
}
