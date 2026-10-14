package com.kanban.domain.board.event;

/** 보드의 소속 조직이 바뀌었거나 보드가 삭제됐다 — 그 보드의 모든 사용자 접근 캐시를 비운다. */
public record BoardAccessScopeChangedEvent(String boardId) {}
