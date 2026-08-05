package com.kanban.domain.personal.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class PromoteCandidateScorerTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 2, 10, 9, 0);
    private static final String ME = "user-me";

    private PromoteCandidateScorer.Candidate candidate(String id, String title) {
        return new PromoteCandidateScorer.Candidate(id, title, null, Set.of(), false, null, null);
    }

    private PromoteCandidateScorer.Context context() {
        return new PromoteCandidateScorer.Context(ME, null, Set.of(), NOW);
    }

    @Test
    @DisplayName("제목이 겹치는 후보가 1위로 온다")
    void titleOverlapWins() {
        List<PromoteCandidateScorer.Candidate> candidates = List.of(
                candidate("t1", "가챠 확률 테이블 정리"),
                candidate("t2", "[네트워크] 네트워크 연결 실패 팝업 미노출"),
                candidate("t3", "캐릭터 도트 애니메이션 깜빡임"));

        List<PromoteCandidateScorer.Scored> ranked = PromoteCandidateScorer.rank(
                "[네트워크] 연결 실패 팝업 미노출 재발", candidates, context(), 3);

        assertThat(ranked.get(0).candidate().id()).isEqualTo("t2");
        assertThat(ranked.get(0).reasonCode()).isEqualTo(PromoteCandidateScorer.ReasonCode.TITLE_MATCH);
        assertThat(ranked.get(0).matchedTokens()).contains("네트워크", "연결", "팝업");
    }

    @Test
    @DisplayName("말머리만 같아도 근거가 된다 — 낱말이 하나도 안 겹칠 때")
    void bracketTagMatch() {
        List<PromoteCandidateScorer.Candidate> candidates = List.of(
                candidate("t1", "[전투] 스태미나 차감 오류"),
                candidate("t2", "[네트워크] 재접속 큐 정리"));

        List<PromoteCandidateScorer.Scored> ranked = PromoteCandidateScorer.rank(
                "[네트워크] 소켓 핸들러 점검", candidates, context(), 3);

        assertThat(ranked.get(0).candidate().id()).isEqualTo("t2");
        assertThat(ranked.get(0).reasonCode()).isEqualTo(PromoteCandidateScorer.ReasonCode.TAG_MATCH);
    }

    @Test
    @DisplayName("조사가 붙어 토큰이 어긋나도 부분 일치로 잡는다")
    void partialTokenMatch() {
        List<PromoteCandidateScorer.Candidate> candidates = List.of(
                candidate("t1", "빌드 스크립트 정리"),
                candidate("t2", "네트워크가 끊기면 재시도한다"));

        List<PromoteCandidateScorer.Scored> ranked = PromoteCandidateScorer.rank(
                "네트워크 재시도 로직", candidates, context(), 3);

        assertThat(ranked.get(0).candidate().id()).isEqualTo("t2");
    }

    @Test
    @DisplayName("겹치는 낱말이 없으면 내 담당 · 최근에 붙인 곳 · 같은 마일스톤이 순위를 만든다")
    void contextSignalsRankWhenNoOverlap() {
        PromoteCandidateScorer.Candidate plain = candidate("t1", "빌드 파이프라인 점검");
        PromoteCandidateScorer.Candidate mine = new PromoteCandidateScorer.Candidate(
                "t2", "리소스 압축 적용", null, Set.of(ME), false, null, null);
        PromoteCandidateScorer.Candidate recent = candidate("t3", "사운드 믹싱 조정");
        PromoteCandidateScorer.Candidate sameMilestone = new PromoteCandidateScorer.Candidate(
                "t4", "번역 파일 갱신", null, Set.of(), false, "ms-1", null);

        PromoteCandidateScorer.Context ctx =
                new PromoteCandidateScorer.Context(ME, "ms-1", Set.of("t3"), NOW);

        List<PromoteCandidateScorer.Scored> ranked = PromoteCandidateScorer.rank(
                "회의 준비", List.of(plain, mine, recent, sameMilestone), ctx, 4);

        // 최근에 붙인 곳(1.5) = 내 담당(1.5) > 같은 마일스톤(1.0) > 아무 신호 없음(0)
        assertThat(ranked).extracting(s -> s.candidate().id())
                .containsExactly("t2", "t3", "t4", "t1");
        assertThat(ranked.get(1).reasonCode()).isEqualTo(PromoteCandidateScorer.ReasonCode.RECENT);
        assertThat(ranked.get(3).reasonCode()).isEqualTo(PromoteCandidateScorer.ReasonCode.RELATED);
    }

    @Test
    @DisplayName("완료된 후보는 같은 조건이면 뒤로 밀린다")
    void completedRanksLower() {
        PromoteCandidateScorer.Candidate done = new PromoteCandidateScorer.Candidate(
                "t1", "네트워크 연결 실패 팝업", null, Set.of(), true, null, null);
        PromoteCandidateScorer.Candidate open = new PromoteCandidateScorer.Candidate(
                "t2", "네트워크 연결 실패 팝업", null, Set.of(), false, null, null);

        List<PromoteCandidateScorer.Scored> ranked = PromoteCandidateScorer.rank(
                "네트워크 연결 실패 팝업", List.of(done, open), context(), 2);

        assertThat(ranked.get(0).candidate().id()).isEqualTo("t2");
    }

    @Test
    @DisplayName("어디에나 있는 낱말(수정·확인)은 근거로 세지 않는다")
    void stopwordsAreIgnored() {
        assertThat(PromoteCandidateScorer.tokenize("수정 확인 작업")).isEmpty();
        assertThat(PromoteCandidateScorer.tokenize("[QA] 로그인 확인"))
                .containsExactly("qa", "로그인");
    }

    @Test
    @DisplayName("말머리는 대괄호·소괄호 둘 다, 대소문자 무시로 읽는다")
    void bracketTagParsing() {
        assertThat(PromoteCandidateScorer.bracketTag("[네트워크] 팝업")).isEqualTo("네트워크");
        assertThat(PromoteCandidateScorer.bracketTag("(QA) 팝업")).isEqualTo("qa");
        assertThat(PromoteCandidateScorer.bracketTag("말머리 없는 제목")).isNull();
        assertThat(PromoteCandidateScorer.bracketTag("제목 뒤의 [태그]")).isNull();
    }

    @Test
    @DisplayName("후보가 요청 개수보다 적으면 있는 만큼만 돌려준다")
    void limitIsUpperBound() {
        List<PromoteCandidateScorer.Scored> ranked = PromoteCandidateScorer.rank(
                "무엇이든", List.of(candidate("t1", "하나")), context(), 25);

        assertThat(ranked).hasSize(1);
    }
}
