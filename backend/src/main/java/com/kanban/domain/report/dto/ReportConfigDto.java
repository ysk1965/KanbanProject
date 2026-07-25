package com.kanban.domain.report.dto;

import com.kanban.domain.report.BoardReportConfig;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;

public class ReportConfigDto {

    /**
     * 보드 설정 화면이 주고받는 형태.
     *
     * <p>화면은 <b>보드 타임존의 시각</b>으로 다루고(09:00), 저장은 UTC로 한다.
     * 변환을 서버가 맡아야 프론트마다 다르게 계산하는 사고가 없다.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Detail {
        private boolean dailyEnabled;
        /** 보드 타임존 기준 발송 시각 (0~23) */
        private int dailyHour;
        private int dailyMinute;

        private boolean weeklyEnabled;
        private int weeklyHour;
        private int weeklyMinute;
        /** ISO 요일 1(월)~7(일), 보드 타임존 기준 */
        private int weeklyDayOfWeek;

        private String timezone;
        private String language;
        private String slackChannelId;
        private String slackChannelName;

        private boolean sourceGithubEnabled;
        private boolean sourceKanbanEnabled;
        private boolean sourceConfluenceEnabled;
        private boolean sourceSlackEnabled;
        /** 봇이 대화를 읽어올 채널 (발송 채널과 별개) */
        private String sourceSlackChannelId;
        private String sourceSlackChannelName;
        private boolean shareLinkEnabled;

        public static Detail from(BoardReportConfig config) {
            ZoneId zone = ZoneId.of(config.getTimezone());
            ZonedDateTime daily = toLocal(config.getDailySendHourUtc(), config.getDailySendMinuteUtc(), zone);
            // 주간은 요일까지 함께 되돌려야 한다. 월 08:00 KST는 UTC로 일요일 23:00이라,
            // 시각만 변환하고 요일을 그대로 두면 화면에 하루 어긋난 요일이 뜬다.
            ZonedDateTime weekly = toLocalWeekly(config.getWeeklySendHourUtc(),
                    config.getWeeklySendMinuteUtc(), config.getWeeklyDayOfWeek(), zone);

            return Detail.builder()
                    .dailyEnabled(Boolean.TRUE.equals(config.getDailyEnabled()))
                    .dailyHour(daily.getHour())
                    .dailyMinute(daily.getMinute())
                    .weeklyEnabled(Boolean.TRUE.equals(config.getWeeklyEnabled()))
                    .weeklyHour(weekly.getHour())
                    .weeklyMinute(weekly.getMinute())
                    .weeklyDayOfWeek(weekly.getDayOfWeek().getValue())
                    .timezone(config.getTimezone())
                    .language(config.getLanguage())
                    .slackChannelId(config.getSlackChannelId())
                    .slackChannelName(config.getSlackChannelName())
                    .sourceGithubEnabled(Boolean.TRUE.equals(config.getSourceGithubEnabled()))
                    .sourceKanbanEnabled(Boolean.TRUE.equals(config.getSourceKanbanEnabled()))
                    .sourceConfluenceEnabled(Boolean.TRUE.equals(config.getSourceConfluenceEnabled()))
                    .sourceSlackEnabled(Boolean.TRUE.equals(config.getSourceSlackEnabled()))
                    .sourceSlackChannelId(config.getSourceSlackChannelId())
                    .sourceSlackChannelName(config.getSourceSlackChannelName())
                    .shareLinkEnabled(Boolean.TRUE.equals(config.getShareLinkEnabled()))
                    .build();
        }

        private static ZonedDateTime toLocal(int hourUtc, int minuteUtc, ZoneId zone) {
            return ZonedDateTime.now(ZoneOffset.UTC)
                    .withHour(hourUtc).withMinute(minuteUtc)
                    .withZoneSameInstant(zone);
        }

        private static ZonedDateTime toLocalWeekly(int hourUtc, int minuteUtc, int dayOfWeekUtc, ZoneId zone) {
            return ZonedDateTime.now(ZoneOffset.UTC)
                    .with(java.time.temporal.TemporalAdjusters.nextOrSame(java.time.DayOfWeek.of(dayOfWeekUtc)))
                    .withHour(hourUtc).withMinute(minuteUtc).withSecond(0).withNano(0)
                    .withZoneSameInstant(zone);
        }
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Update {
        private Boolean dailyEnabled;
        private Integer dailyHour;
        private Integer dailyMinute;

        private Boolean weeklyEnabled;
        private Integer weeklyHour;
        private Integer weeklyMinute;
        private Integer weeklyDayOfWeek;

        private String timezone;
        private String language;
        private String slackChannelId;
        private String slackChannelName;

        private Boolean sourceGithubEnabled;
        private Boolean sourceKanbanEnabled;
        private Boolean sourceConfluenceEnabled;
        private Boolean sourceSlackEnabled;
        private String sourceSlackChannelId;
        private String sourceSlackChannelName;
        private Boolean shareLinkEnabled;
    }
}
