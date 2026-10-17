package com.kanban.domain.sprint.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 균등 분배 경계 검증. 경계 = 스프린트 2..N의 시작일이므로,
 * 세그먼트 i는 [이전 경계(또는 마일스톤 시작), 다음 경계 - 1일]이다.
 */
class SprintSplitBoundaryTest {

    private static final LocalDate START = LocalDate.of(2026, 8, 18);
    private static final LocalDate END = LocalDate.of(2026, 10, 2); // 46일

    @Test
    @DisplayName("경계 개수는 count-1, 모두 기간 안에서 순증가한다")
    void boundaryCountAndOrder() {
        List<LocalDate> cuts = SprintService.equalBoundaries(START, END, 3);

        assertThat(cuts).hasSize(2);
        assertThat(cuts.get(0)).isAfter(START).isBefore(cuts.get(1));
        assertThat(cuts.get(1)).isBeforeOrEqualTo(END);
    }

    @Test
    @DisplayName("세그먼트를 이어 붙이면 빠지는 날 없이 마일스톤 전체를 덮는다")
    void segmentsCoverWholePeriod() {
        for (int count = 1; count <= 6; count++) {
            List<LocalDate> cuts = SprintService.equalBoundaries(START, END, count);
            LocalDate cursor = START;
            for (LocalDate cut : cuts) {
                assertThat(cut).isAfter(cursor); // 각 세그먼트 최소 1일
                cursor = cut;
            }
            assertThat(cursor).isBeforeOrEqualTo(END);
        }
    }

    @Test
    @DisplayName("균등 분배 — 세그먼트 일수 차이는 1일 이내")
    void segmentsAreNearlyEqual() {
        int count = 4;
        List<LocalDate> cuts = SprintService.equalBoundaries(START, END, count);

        long totalDays = ChronoUnit.DAYS.between(START, END) + 1;
        LocalDate segStart = START;
        for (int i = 0; i < count; i++) {
            LocalDate segEnd = i == count - 1 ? END : cuts.get(i).minusDays(1);
            long days = ChronoUnit.DAYS.between(segStart, segEnd) + 1;
            assertThat(days)
                    .isBetween(totalDays / count, totalDays / count + 1);
            segStart = segEnd.plusDays(1);
        }
    }

    @Test
    @DisplayName("count=1이면 경계가 없다 (나누지 않음)")
    void singleSprintHasNoBoundaries() {
        assertThat(SprintService.equalBoundaries(START, END, 1)).isEmpty();
    }
}
