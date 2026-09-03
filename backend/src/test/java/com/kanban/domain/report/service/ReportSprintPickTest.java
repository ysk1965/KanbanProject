package com.kanban.domain.report.service;

import com.kanban.domain.sprint.Sprint;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 리포트 스프린트 선택({@link BoardProgressCollector#pickReportSprint}) 단위 테스트.
 *
 * <p>회귀 배경: 마일스톤마다 스프린트가 있고 기간 백필 전(start/end NULL) 스프린트는 CURRENT로
 * 파생되므로, "첫 CURRENT"를 집으면 빈 마일스톤의 스프린트가 잡혀 일일 보고서 게이지가 0/0이 됐다.
 */
class ReportSprintPickTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 3);

    private Sprint sprint(String id, int seq, LocalDate start, LocalDate end) {
        return Sprint.builder().id(id).name("Sprint " + seq).sequenceNo(seq)
                .startDate(start).endDate(end).build();
    }

    @Test
    @DisplayName("기간 백필 전(NULL) 빈 스프린트가 앞에 있어도, 기간 안 + 태스크 보유 스프린트를 고른다")
    void datedCurrentWithTasksBeatsUnbackfilledEmpty() {
        Sprint emptyUnbackfilled = sprint("empty-null", 1, null, null); // stateOn=CURRENT
        Sprint real = sprint("real", 1, LocalDate.of(2026, 8, 18), LocalDate.of(2026, 9, 5));

        Sprint picked = BoardProgressCollector.pickReportSprint(
                List.of(emptyUnbackfilled, real), Set.of("real"), TODAY);

        assertThat(picked.getId()).isEqualTo("real");
    }

    @Test
    @DisplayName("기간 백필 전이라도 태스크가 담긴 스프린트가 빈 현재 버킷보다 우선한다")
    void unbackfilledWithTasksBeatsDatedEmptyCurrent() {
        Sprint datedEmpty = sprint("dated-empty", 2, LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 14));
        Sprint tasked = sprint("tasked-null", 1, null, null);

        Sprint picked = BoardProgressCollector.pickReportSprint(
                List.of(datedEmpty, tasked), Set.of("tasked-null"), TODAY);

        assertThat(picked.getId()).isEqualTo("tasked-null");
    }

    @Test
    @DisplayName("현재 버킷이 정말 비어 있으면(기간 설정됨) 지난 스프린트의 태스크보다 그 빈 버킷을 고른다 — 0/0이 사실")
    void genuinelyEmptyCurrentBucketWins() {
        Sprint pastTasked = sprint("past", 1, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31));
        Sprint currentEmpty = sprint("current", 2, LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 14));

        Sprint picked = BoardProgressCollector.pickReportSprint(
                List.of(currentEmpty, pastTasked), Set.of("past"), TODAY);

        assertThat(picked.getId()).isEqualTo("current");
    }

    @Test
    @DisplayName("오늘이 어느 기간에도 안 걸리면 태스크가 담긴 최근 스프린트로 폴백한다")
    void fallsBackToTaskedSprintWhenNoCurrent() {
        Sprint future = sprint("future", 3, LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 14));
        Sprint pastTasked = sprint("past-tasked", 2, LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31));
        Sprint pastEmpty = sprint("past-empty", 1, LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30));

        Sprint picked = BoardProgressCollector.pickReportSprint(
                List.of(future, pastTasked, pastEmpty), Set.of("past-tasked"), TODAY);

        assertThat(picked.getId()).isEqualTo("past-tasked");
    }

    @Test
    @DisplayName("전부 빈 스프린트뿐이면 리스트 첫 번째(최신 시퀀스)를 유지한다")
    void allEmptyKeepsListOrder() {
        Sprint future = sprint("future", 2, LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 14));
        Sprint past = sprint("past", 1, LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30));

        Sprint picked = BoardProgressCollector.pickReportSprint(
                List.of(future, past), Set.of(), TODAY);

        assertThat(picked.getId()).isEqualTo("future");
    }

    @Test
    @DisplayName("동순위(둘 다 기간 안 + 태스크 보유)면 리스트 앞쪽이 이긴다 — 순서는 쿼리가 고정")
    void tieKeepsListOrder() {
        Sprint first = sprint("first", 2, LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 14));
        Sprint second = sprint("second", 1, LocalDate.of(2026, 8, 18), LocalDate.of(2026, 9, 5));

        Sprint picked = BoardProgressCollector.pickReportSprint(
                List.of(first, second), Set.of("first", "second"), TODAY);

        assertThat(picked.getId()).isEqualTo("first");
    }
}
