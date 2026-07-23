package com.kanban.domain.report.source;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;

/**
 * 보고서가 덮는 시간 구간. 시작은 포함, 끝은 제외한다.
 *
 * <p>일일과 주간이 <b>같은 기준선</b>(보드 로컬 시각의 발송 시각)을 쓰기 때문에 경계가 겹치지 않는다.
 * 09:00에 발송하는 보드라면 일일은 어제 09:00~오늘 09:00, 주간은 지난주 토요일 09:00~이번 토요일 09:00이다.
 */
public record ReportPeriod(
        ZonedDateTime startInclusive,
        ZonedDateTime endExclusive,
        ZoneId zone
) {
    private static final DateTimeFormatter LABEL = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    /** 발송 시각 기준 직전 24시간 */
    public static ReportPeriod daily(ZonedDateTime sendAt) {
        return new ReportPeriod(sendAt.minusDays(1), sendAt, sendAt.getZone());
    }

    /** 발송 시각 기준 직전 7일 */
    public static ReportPeriod weekly(ZonedDateTime sendAt) {
        return new ReportPeriod(sendAt.minusDays(7), sendAt, sendAt.getZone());
    }

    /**
     * 미리보기용 — 설정이 아직 저장되기 전에도 "지난주에 이만큼 잡힌다"를 보여주기 위한 구간.
     * 요청 시각이 아니라 <b>가장 최근에 지나간 해당 요일</b>을 끝점으로 삼아, 실제 발송과 같은 모양의 구간을 만든다.
     */
    public static ReportPeriod previewWeekly(ZonedDateTime now, DayOfWeek boundary, int hour, int minute) {
        ZonedDateTime end = now.with(TemporalAdjusters.previousOrSame(boundary))
                .withHour(hour).withMinute(minute).withSecond(0).withNano(0);
        if (end.isAfter(now)) {
            end = end.minusWeeks(1);
        }
        return new ReportPeriod(end.minusDays(7), end, now.getZone());
    }

    public static ReportPeriod previewDaily(ZonedDateTime now, int hour, int minute) {
        ZonedDateTime end = now.withHour(hour).withMinute(minute).withSecond(0).withNano(0);
        if (end.isAfter(now)) {
            end = end.minusDays(1);
        }
        return new ReportPeriod(end.minusDays(1), end, now.getZone());
    }

    /** GitHub·Confluence API가 요구하는 ISO-8601 UTC 표기 */
    public String startIso() {
        return startInclusive.toInstant().toString();
    }

    public String endIso() {
        return endExclusive.toInstant().toString();
    }

    public LocalDate startDate() {
        return startInclusive.toLocalDate();
    }

    /** 끝점은 제외 구간이므로, 표시용 날짜는 하루 앞을 쓴다. */
    public LocalDate endDate() {
        return endExclusive.minusNanos(1).toLocalDate();
    }

    public String label() {
        return startInclusive.format(LABEL) + " ~ " + endExclusive.format(LABEL);
    }
}
