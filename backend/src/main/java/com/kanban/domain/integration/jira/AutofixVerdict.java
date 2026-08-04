package com.kanban.domain.integration.jira;

/**
 * 자동수정 트리아지 판정.
 *
 * <p>판정 기준은 "AI가 고칠 수 있는가"가 아니라 <b>"고쳐졌음을 자동으로 검증할 수 있는가"</b>다.
 * 검증 수단이 없는 이슈는 PR을 만들어도 사람이 전부 손으로 확인해야 해서 자동화 이득이 사라진다.
 */
public enum AutofixVerdict {

    /** 자동 검증 수단이 명확하다 — 자동수정 큐에 태울 수 있다. */
    CANDIDATE,

    /** 재현 절차나 기대 사양이 이슈에 적히면 검증 가능해진다 — 사람이 보강하면 후보로 승격. */
    CONDITIONAL,

    /** 시각 확인이나 기획 판단이 필요해 자동 검증이 불가능하다. */
    EXCLUDED
}
