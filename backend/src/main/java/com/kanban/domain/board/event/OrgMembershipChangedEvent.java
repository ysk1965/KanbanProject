package com.kanban.domain.board.event;

/** organization_members 행이 생성/수정/삭제됐다 — 그 사용자의 모든 보드 접근 캐시를 비운다(조직 보드 폴백이 바뀐다). */
public record OrgMembershipChangedEvent(String orgId, String userId) {}
