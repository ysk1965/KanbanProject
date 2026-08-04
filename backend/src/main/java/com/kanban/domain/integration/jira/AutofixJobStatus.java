package com.kanban.domain.integration.jira;

import java.util.Set;

/**
 * 자동수정 작업 상태.
 *
 * <pre>
 * QUEUED ──claim──▶ DISPATCHED ──callback──▶ SUCCEEDED / NO_CHANGE / FAILED
 *   │                   └───────timeout────▶ TIMED_OUT
 *   └──cancel──▶ CANCELLED
 * </pre>
 */
public enum AutofixJobStatus {

    /** 큐에 담김. 아직 러너가 가져가지 않았다. */
    QUEUED,

    /** 러너가 가져가 작업 중. 이 상태의 작업이 있으면 다음 건을 내주지 않는다(직렬 보장). */
    DISPATCHED,

    /** PR이 만들어졌다. */
    SUCCEEDED,

    /** 러너는 정상 종료했지만 에이전트가 변경을 만들지 않았다(고칠 수 없다고 판단). */
    NO_CHANGE,

    /** 러너가 실패했다(컴파일 불통과 포함). */
    FAILED,

    /**
     * 콜백이 끝내 오지 않았다. 맥이 죽거나 네트워크가 끊기면 여기로 떨어진다 —
     * 이게 없으면 DISPATCHED 하나가 큐 전체를 영구히 막는다.
     */
    TIMED_OUT,

    /** 사람이 취소했다. */
    CANCELLED;

    /** 더 이상 변하지 않는 상태. */
    private static final Set<AutofixJobStatus> TERMINAL =
            Set.of(SUCCEEDED, NO_CHANGE, FAILED, TIMED_OUT, CANCELLED);

    public boolean isTerminal() {
        return TERMINAL.contains(this);
    }

    /** 러너가 물고 있는 상태 — 직렬 보장의 기준. */
    public boolean isInFlight() {
        return this == DISPATCHED;
    }
}
