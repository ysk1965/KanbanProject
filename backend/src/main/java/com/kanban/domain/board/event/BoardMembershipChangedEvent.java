package com.kanban.domain.board.event;

/** board_members 행이 생성/수정/삭제됐다 — (boardId, userId) 접근 캐시 엔트리를 비운다. */
public record BoardMembershipChangedEvent(String boardId, String userId) {}
