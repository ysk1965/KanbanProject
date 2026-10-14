package com.kanban.domain.board.event;

/** 사용자의 systemRole 이 바뀌었거나 사용자가 삭제됐다 — 그 사용자의 모든 보드 접근 캐시를 비운다. */
public record UserSystemRoleChangedEvent(String userId) {}
