package com.kanban.domain.board.event;

/** 조직의 autoBoardAccessEnabled 가 바뀌었거나 조직이 삭제됐다 — 접근 캐시 전체를 비운다(조직 보드 목록 조회 없이). */
public record OrgSettingsChangedEvent(String orgId) {}
