package com.kanban.domain.talent;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("ChallengeClock — 한 주 = 월 00:00 ~ 일 22:00 KST")
class ChallengeClockTest {

    private static Instant kst(String localDateTime) {
        return LocalDateTime.parse(localDateTime).atZone(ChallengeClock.ZONE).toInstant();
    }

    @Test
    @DisplayName("일요일 21:59 KST 는 그 주, 22:00 부터는 다음 주")
    void sundayCutoff() {
        assertThat(ChallengeClock.weekOf(kst("2026-11-01T21:59:59"))).isEqualTo(LocalDate.of(2026, 10, 26));
        assertThat(ChallengeClock.weekOf(kst("2026-11-01T22:00:00"))).isEqualTo(LocalDate.of(2026, 11, 2));
        assertThat(ChallengeClock.weekOf(kst("2026-11-01T23:59:59"))).isEqualTo(LocalDate.of(2026, 11, 2));
    }

    @Test
    @DisplayName("월요일 00:00 KST 는 그 월요일 주")
    void mondayMidnight() {
        assertThat(ChallengeClock.weekOf(kst("2026-11-02T00:00:00"))).isEqualTo(LocalDate.of(2026, 11, 2));
        assertThat(ChallengeClock.weekOf(kst("2026-10-26T00:00:00"))).isEqualTo(LocalDate.of(2026, 10, 26));
        // UTC 로는 일요일 15:00 → KST 월 00:00
        assertThat(ChallengeClock.weekOf(LocalDateTime.of(2026, 10, 25, 15, 0))).isEqualTo(LocalDate.of(2026, 10, 26));
    }

    @Test
    @DisplayName("주 끝 = 일요일 22:00 KST = 13:00Z, 주 시작 = 앞 일요일 22:00 KST")
    void weekBounds() {
        LocalDate week = LocalDate.of(2026, 10, 26);
        assertThat(ChallengeClock.weekEnd(week)).isEqualTo(Instant.parse("2026-11-01T13:00:00Z"));
        assertThat(ChallengeClock.weekStart(week)).isEqualTo(Instant.parse("2026-10-25T13:00:00Z"));
        assertThat(ChallengeClock.isWeekKey(week)).isTrue();
        assertThat(ChallengeClock.isWeekKey(week.plusDays(1))).isFalse();
    }

    @Test
    @DisplayName("하루·달은 KST 자정 기준, 리워드 만료 = 다음 달 말일 23:59:59 KST")
    void dayAndMonth() {
        Instant t = kst("2026-10-31T23:30:00"); // UTC 로는 10/31 14:30
        assertThat(ChallengeClock.dayOf(t)).isEqualTo(LocalDate.of(2026, 10, 31));
        assertThat(ChallengeClock.dayOf(kst("2026-11-01T00:10:00"))).isEqualTo(LocalDate.of(2026, 11, 1));
        assertThat(ChallengeClock.monthStart(t)).isEqualTo(Instant.parse("2026-09-30T15:00:00Z"));
        assertThat(ChallengeClock.endOfNextMonth(t)).isEqualTo(Instant.parse("2026-11-30T14:59:59Z"));
        assertThat(ChallengeClock.toUtc(Instant.parse("2026-11-30T14:59:59Z")))
                .isEqualTo(LocalDateTime.of(2026, 11, 30, 14, 59, 59));
        assertThat(ChallengeClock.fromUtc(LocalDateTime.of(2026, 1, 1, 0, 0)))
                .isEqualTo(LocalDateTime.of(2026, 1, 1, 0, 0).toInstant(ZoneOffset.UTC));
    }

    @Test
    @DisplayName("갈피 주는 프런트와 같이 일요일 시작")
    void galpiWeek() {
        assertThat(ChallengeClock.galpiWeekOf(LocalDate.of(2026, 10, 25))).isEqualTo(LocalDate.of(2026, 10, 25));
        assertThat(ChallengeClock.galpiWeekOf(LocalDate.of(2026, 10, 31))).isEqualTo(LocalDate.of(2026, 10, 25));
    }
}
