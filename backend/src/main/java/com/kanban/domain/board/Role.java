package com.kanban.domain.board;

public enum Role {
    OWNER,   // 보드 생성자, 최고 권한
    ADMIN,   // 관리자
    MEMBER,  // 일반 멤버
    VIEWER   // 읽기 전용
}
