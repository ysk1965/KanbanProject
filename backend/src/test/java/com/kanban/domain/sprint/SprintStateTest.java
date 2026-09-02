package com.kanban.domain.sprint;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class SprintStateTest {

    private Sprint sprint(LocalDate start, LocalDate end) {
        return Sprint.builder().name("Sprint 1").sequenceNo(1).startDate(start).endDate(end).build();
    }

    @Test
    @DisplayName("기간 안이면 CURRENT, 경계일(시작·종료 당일)도 CURRENT")
    void currentIncludesBoundaryDays() {
        Sprint s = sprint(LocalDate.of(2026, 8, 18), LocalDate.of(2026, 9, 1));

        assertThat(s.stateOn(LocalDate.of(2026, 8, 18))).isEqualTo(SprintState.CURRENT);
        assertThat(s.stateOn(LocalDate.of(2026, 8, 25))).isEqualTo(SprintState.CURRENT);
        assertThat(s.stateOn(LocalDate.of(2026, 9, 1))).isEqualTo(SprintState.CURRENT);
    }

    @Test
    @DisplayName("종료일 다음 날부터 PAST, 시작일 전날까지 FUTURE")
    void pastAndFuture() {
        Sprint s = sprint(LocalDate.of(2026, 8, 18), LocalDate.of(2026, 9, 1));

        assertThat(s.stateOn(LocalDate.of(2026, 9, 2))).isEqualTo(SprintState.PAST);
        assertThat(s.stateOn(LocalDate.of(2026, 8, 17))).isEqualTo(SprintState.FUTURE);
    }

    @Test
    @DisplayName("기간이 비어 있으면 CURRENT — 나누기 전 단일 스프린트 보호")
    void nullDatesAreCurrent() {
        assertThat(sprint(null, null).stateOn(LocalDate.of(2026, 9, 2))).isEqualTo(SprintState.CURRENT);
        assertThat(sprint(LocalDate.of(2026, 8, 18), null).stateOn(LocalDate.of(2026, 12, 31)))
                .isEqualTo(SprintState.CURRENT);
        assertThat(sprint(null, LocalDate.of(2026, 9, 1)).stateOn(LocalDate.of(2026, 8, 1)))
                .isEqualTo(SprintState.CURRENT);
    }
}
