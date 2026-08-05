package com.kanban.domain.integration.jira;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 자동수정 저장소의 {@code @Query} JPQL이 실제로 파싱되는지 확인한다.
 *
 * <p><b>왜 이 테스트가 있는가.</b> {@code @Query}의 JPQL은 문자열이라 컴파일러가 보지 못하고,
 * Hibernate가 <b>빈 생성 시점</b>에 파싱한다. 그래서 엔티티 필드를 리네임하면 컴파일도 통과하고
 * 단위 테스트(전부 Mockito 목)도 통과한 뒤, 배포된 인스턴스가 기동에 실패해서야 드러난다.
 * 실제로 {@code jira_issue_key → job_key} 리네임 때 {@code countOutcomesByCategory}의 조인 조건이
 * 옛 이름으로 남아 dev 백엔드가 뜨지 못했다.
 *
 * <p>단언이 느슨한 것은 의도적이다 — 이 테스트의 값어치는 <b>쿼리가 파싱된다</b>는 사실 자체에
 * 있지 결과값에 있지 않다. 메서드를 한 번 호출하면 Hibernate가 SQL까지 만들어 보므로,
 * 필드명·타입·조인 경로가 어긋나면 여기서 터진다.
 */
@DataJpaTest
@ActiveProfiles("local")
@DisplayName("자동수정 저장소 JPQL 파싱")
class JiraAutofixRepositoryQueryTest {

    private static final String BOARD_ID = "board-does-not-exist";

    @Autowired
    private JiraAutofixJobRepository jobRepository;

    @Autowired
    private JiraAutofixTriageRepository triageRepository;

    @Autowired
    private JiraAutofixTriageRunRepository runRepository;

    @Test
    @DisplayName("작업 저장소의 모든 쿼리가 파싱된다")
    void jobQueriesParse() {
        assertThat(jobRepository.findByBoardId(BOARD_ID, PageRequest.of(0, 10))).isEmpty();
        assertThat(jobRepository.countQueued(BOARD_ID)).isZero();
        assertThat(jobRepository.countQueuedManual(BOARD_ID)).isZero();
        assertThat(jobRepository.findCallbackTargetsByJobKey(BOARD_ID, "QASA-1")).isEmpty();
        // 다시 담기가 대체 표시(superseded_at)를 이 가드에 끼워 넣었다 — 필드명이 어긋나면 기동이 죽는다
        assertThat(jobRepository.existsActiveForIssue(BOARD_ID, "QASA-1")).isFalse();
    }

    /** 리네임이 실제로 깨뜨렸던 쿼리 — 트리아지와 작업을 이슈키로 이어 붙인다. */
    @Test
    @DisplayName("트리아지 실적 집계가 파싱된다 (job_key 리네임 회귀)")
    void outcomeAggregationParses() {
        assertThat(triageRepository.countOutcomesByCategory(BOARD_ID)).isEmpty();
        assertThat(triageRepository.countByVerdictAndCategory(BOARD_ID)).isEmpty();
    }

    /** 진행률 원장 — 매핑이 깨지면 판정 버튼이 통째로 죽는다(시작조차 못 한다). */
    @Test
    @DisplayName("트리아지 실행 조회가 파싱된다")
    void triageRunQueriesParse() {
        assertThat(runRepository.findLatest(BOARD_ID)).isEmpty();
    }
}
