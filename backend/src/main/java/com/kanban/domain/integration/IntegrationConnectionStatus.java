package com.kanban.domain.integration;

/**
 * 연동 카드가 화면에서 취하는 상태. GitHub·Confluence가 같은 어휘를 공유한다.
 */
public enum IntegrationConnectionStatus {
    /** 인증은 살아 있고 대상도 선택됨 */
    CONNECTED,
    /** 인증은 됐지만 볼 대상(저장소·스페이스)이 아직 선택되지 않음 */
    TARGET_NOT_SELECTED,
    /** 토큰 만료·앱 삭제·권한 회수 등으로 접근 불가 — 재인증 필요 */
    DISCONNECTED
}
