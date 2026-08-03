package com.kanban.domain.integration.jira;

/**
 * 댓글이 처음 작성된 곳. 삭제 동기화의 권한 판정에 쓰인다.
 *
 * <p>BRIDGE 발 코멘트는 JIRA에서 연동 계정 소유라 "Delete own comments" 권한만으로 지울 수 있지만,
 * JIRA 발 코멘트는 남이 쓴 글이라 "Delete all comments"가 필요하다(대개 없음).
 * 그래서 BRIDGE→JIRA 삭제 전파는 {@link #BRIDGE} 인 것만 수행한다.
 */
public enum JiraCommentOrigin {
    /** BRIDGE에서 작성 → JIRA로 push된 댓글. */
    BRIDGE,
    /** JIRA에서 작성 → BRIDGE로 pull된 댓글. */
    JIRA
}
