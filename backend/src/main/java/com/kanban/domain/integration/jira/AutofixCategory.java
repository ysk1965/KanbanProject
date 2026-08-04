package com.kanban.domain.integration.jira;

/**
 * 트리아지 이슈 유형. 판정 자체는 {@link AutofixVerdict}가 들고, 이 값은
 * "어떤 종류가 몇 건인지" 집계해 자동화 투자 판단에 쓰기 위한 분류다.
 */
public enum AutofixCategory {

    /** 문구·오탈자·표현 혼용. */
    TEXT,

    /** 널 체크 누락·예외 방어. */
    NULL_GUARD,

    /** 하드코딩 상수·수치 밸런스. */
    CONSTANT,

    /** 계산 로직 오류(보상·확률 등). */
    LOGIC,

    /** UI 갱신 지연·상태 미반영. */
    UI_STATE,

    /** 아이콘·이펙트·에셋 표시. */
    ASSET,

    /** 기획 의도 판단이 선행되어야 하는 건. */
    DESIGN_INTENT,

    /** 위 어디에도 들어맞지 않음. */
    OTHER
}
