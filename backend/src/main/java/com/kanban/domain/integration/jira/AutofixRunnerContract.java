package com.kanban.domain.integration.jira;

/**
 * 서버와 맥의 러너가 주고받는 <b>작업 명세 계약</b>의 버전.
 *
 * <p><b>왜 버전이 필요한가.</b> 러너 스크립트는 저장소에 있지만 실행은 맥의 {@code ~/bridge-autofix}에
 * 복사된 사본이 한다. 서버만 배포되고 사본이 남으면 두 쪽이 다른 계약을 말하는데, JSON은 모르는 키를
 * 조용히 무시하고 없는 키를 빈 값으로 준다 — <b>어긋남이 오류가 아니라 빈 문자열로 나타난다.</b>
 *
 * <p>2026-08-05에 이것으로 파이프라인이 멈췄다. 큐가 JIRA 전용이 아니게 되면서
 * {@code jira_issue_key → job_key}로 리네임됐고, 구버전 러너는 키를 못 읽어 매 건을 실패시켰다.
 * 실패 한 건은 90분(dispatch-timeout) 동안 큐 전체를 막고 그 대상을 영구히 태운다.
 *
 * <p><b>그래서 작업을 내주기 전에 거른다.</b> 러너가 claim에 자기 버전을 실어 보내고, 다르면 서버는
 * {@code CONTRACT_MISMATCH}만 돌려준다 — 작업은 큐에 그대로 남고, 아무것도 타지 않으며,
 * 원인이 러너 로그·도크·슬랙에 문장으로 뜬다.
 *
 * <p><b>규칙:</b> {@link com.kanban.domain.integration.jira.dto.JiraAutofixResponse.RunnerJob}의
 * 필드를 추가·삭제·리네임하면 이 값을 올리고, 같은 커밋에서
 * {@code tools/autofix/runner/bridge-autofix-runner.sh}의 {@code RUNNER_CONTRACT}도 함께 올린다.
 * 둘이 어긋나면 {@code JiraAutofixRunnerContractTest}가 CI에서 막는다.
 *
 * <p>필드를 <b>추가만</b> 하는 변경도 올린다. 구버전 러너가 그 값을 못 보고 조용히 다르게 동작하는 것이
 * 값을 못 읽어 실패하는 것보다 위험하다 — 후자는 즉시 드러나고 전자는 결과가 틀린 채로 굴러간다.
 */
public final class AutofixRunnerContract {

    /**
     * 현재 계약 버전.
     *
     * <ul>
     *   <li>1 — 최초 pull 방식 러너 (jira_issue_key, issue_title, issue_body, verification, test_infra)</li>
     *   <li>2 — 댓글·첨부(comments, materials) 추가</li>
     *   <li>3 — 큐 일반화: job_key / job_kind / title / instruction (수동 위임 도입)</li>
     * </ul>
     */
    public static final int VERSION = 3;

    private AutofixRunnerContract() {}

    /** 러너가 버전을 보내지 않으면(구버전) 계약 이전 세대다 — 일치로 볼 수 없다. */
    public static boolean matches(Integer runnerVersion) {
        return runnerVersion != null && runnerVersion == VERSION;
    }
}
