package com.kanban.domain.talent;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import org.springframework.stereotype.Component;

/**
 * 챌린지(달란트·랭킹·리그)의 시계.
 *
 * <p>CLAUDE.md 는 지역 타임존 하드코딩을 금지하지만, 챌린지의 "한 주"와 "하루"는 <b>제품 규칙</b>으로 한국 시간에 고정한다
 * (월요일 00:00 ~ 일요일 22:00 KST, 일요일 22:00 이후는 다음 주). 이 클래스가 {@code Asia/Seoul} 을 쓰는 유일한 곳이고, 저장
 * 시각은 모두 UTC 다.
 *
 * <p>테스트는 {@link #useClock(Clock)} 으로 시각을 고정한다.
 */
@Component
public class ChallengeClock {

    /** 스케줄러 cron zone 에도 이 상수를 쓴다 */
    public static final String ZONE_ID = "Asia/Seoul";

    public static final ZoneId ZONE = ZoneId.of(ZONE_ID);

    /** 일요일 이 시각부터는 다음 주 */
    private static final LocalTime WEEK_CUTOFF = LocalTime.of(22, 0);

    private volatile Clock clock = Clock.systemUTC();

    public void useClock(Clock clock) {
        this.clock = clock != null ? clock : Clock.systemUTC();
    }

    public Instant now() {
        return clock.instant();
    }

    /** 저장용 UTC LocalDateTime */
    public LocalDateTime nowUtc() {
        return LocalDateTime.ofInstant(now(), ZoneOffset.UTC);
    }

    public LocalDate currentWeek() {
        return weekOf(now());
    }

    public LocalDate today() {
        return dayOf(now());
    }

    // ───────────────── 순수 계산 ─────────────────

    /** 그 시각이 속한 주의 키(월요일 날짜) */
    public static LocalDate weekOf(Instant instant) {
        ZonedDateTime z = instant.atZone(ZONE);
        LocalDate date = z.toLocalDate();
        if (z.getDayOfWeek() == DayOfWeek.SUNDAY && !z.toLocalTime().isBefore(WEEK_CUTOFF)) {
            date = date.plusDays(1);
        }
        return date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    public static LocalDate weekOf(LocalDateTime utc) {
        return weekOf(utc.toInstant(ZoneOffset.UTC));
    }

    /** 주 시작 = 앞 일요일 22:00 KST */
    public static Instant weekStart(LocalDate week) {
        return week.minusDays(1).atTime(WEEK_CUTOFF).atZone(ZONE).toInstant();
    }

    /** 주 끝 = 그 주 일요일 22:00 KST (배타) */
    public static Instant weekEnd(LocalDate week) {
        return week.plusDays(6).atTime(WEEK_CUTOFF).atZone(ZONE).toInstant();
    }

    /** 키가 월요일인지 */
    public static boolean isWeekKey(LocalDate week) {
        return week != null && week.getDayOfWeek() == DayOfWeek.MONDAY;
    }

    /** 한국 날짜 */
    public static LocalDate dayOf(Instant instant) {
        return instant.atZone(ZONE).toLocalDate();
    }

    public static Instant dayStart(LocalDate day) {
        return day.atStartOfDay(ZONE).toInstant();
    }

    public static Instant dayEnd(LocalDate day) {
        return day.plusDays(1).atStartOfDay(ZONE).toInstant();
    }

    /** 그 시각이 속한 한국 달의 시작(포함) */
    public static Instant monthStart(Instant instant) {
        return YearMonth.from(instant.atZone(ZONE)).atDay(1).atStartOfDay(ZONE).toInstant();
    }

    public static Instant monthEnd(Instant instant) {
        return YearMonth.from(instant.atZone(ZONE))
                .plusMonths(1)
                .atDay(1)
                .atStartOfDay(ZONE)
                .toInstant();
    }

    /** 다음 달 말일 23:59:59 KST — 리워드 크레딧 만료 */
    public static Instant endOfNextMonth(Instant instant) {
        return YearMonth.from(instant.atZone(ZONE))
                .plusMonths(1)
                .atEndOfMonth()
                .atTime(23, 59, 59)
                .atZone(ZONE)
                .toInstant();
    }

    /** 갈피 주(일~토, 노트 date 기준) — 프런트 weekOf 와 같은 정의 */
    public static LocalDate galpiWeekOf(LocalDate noteDate) {
        return noteDate.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
    }

    public static LocalDateTime toUtc(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    public static Instant fromUtc(LocalDateTime utc) {
        return utc.toInstant(ZoneOffset.UTC);
    }
}
