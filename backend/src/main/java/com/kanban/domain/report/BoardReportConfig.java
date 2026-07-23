package com.kanban.domain.report;

import com.kanban.domain.board.Board;
import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 보드별 자동 보고서 발송 설정.
 *
 * <p>발송 시각은 <b>UTC로 환산해 저장</b>하고 표시용 타임존을 함께 둔다
 * ({@code DailyStandupConfig}와 같은 방식). 09:00 KST = 00:00 UTC.
 * 스케줄러가 매분 돌며 현재 UTC 시·분과 일치하는 설정만 집어가므로,
 * 보드마다 다른 시각·타임존을 쓸 수 있다.
 */
@Entity
@Table(
    name = "board_report_configs",
    uniqueConstraints = @UniqueConstraint(name = "uk_board_report_config_board", columnNames = {"board_id"}),
    indexes = {
        @Index(name = "idx_board_report_config_daily", columnList = "daily_enabled, daily_send_hour_utc, daily_send_minute_utc"),
        @Index(name = "idx_board_report_config_weekly", columnList = "weekly_enabled, weekly_send_hour_utc, weekly_send_minute_utc")
    }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BoardReportConfig extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    // ── 일일 보고서 ──────────────────────────────
    @Column(name = "daily_enabled", nullable = false)
    private Boolean dailyEnabled = false;

    @Column(name = "daily_send_hour_utc", nullable = false)
    private Integer dailySendHourUtc = 0;

    @Column(name = "daily_send_minute_utc", nullable = false)
    private Integer dailySendMinuteUtc = 0;

    @Column(name = "daily_last_sent_at")
    private LocalDateTime dailyLastSentAt;

    // ── 주간 보고서 ──────────────────────────────
    @Column(name = "weekly_enabled", nullable = false)
    private Boolean weeklyEnabled = false;

    @Column(name = "weekly_send_hour_utc", nullable = false)
    private Integer weeklySendHourUtc = 0;

    @Column(name = "weekly_send_minute_utc", nullable = false)
    private Integer weeklySendMinuteUtc = 0;

    /** ISO-8601 기준 1(월) ~ 7(일). 기본 6(토) — UTC 기준 요일이다. */
    @Column(name = "weekly_day_of_week", nullable = false)
    private Integer weeklyDayOfWeek = DayOfWeek.SATURDAY.getValue();

    @Column(name = "weekly_last_sent_at")
    private LocalDateTime weeklyLastSentAt;

    // ── 공통 ────────────────────────────────────
    /** 표시·집계 구간 계산용 (예: Asia/Seoul) */
    @Column(name = "timezone", nullable = false, length = 60)
    private String timezone = "Asia/Seoul";

    @Column(name = "language", nullable = false, length = 10)
    private String language = "ko";

    /** 봇이 게시할 공용 채널. 멤버 개인 웹훅 발송은 지원하지 않는다. */
    @Column(name = "slack_channel_id", length = 40)
    private String slackChannelId;

    @Column(name = "slack_channel_name", length = 100)
    private String slackChannelName;

    // ── 소스 on/off ─────────────────────────────
    @Column(name = "source_github_enabled", nullable = false)
    private Boolean sourceGithubEnabled = true;

    @Column(name = "source_kanban_enabled", nullable = false)
    private Boolean sourceKanbanEnabled = true;

    @Column(name = "source_confluence_enabled", nullable = false)
    private Boolean sourceConfluenceEnabled = true;

    /**
     * 공유 링크 발급 여부. 슬랙 버튼이 {@code /r/{shareToken}}을 가리키므로 기본 true다.
     * 유출 시 이 값을 내리면 기존 링크까지 한 번에 막힌다.
     */
    @Column(name = "share_link_enabled", nullable = false)
    private Boolean shareLinkEnabled = true;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    @Builder
    public BoardReportConfig(Board board, String timezone, String language) {
        this.board = board;
        this.timezone = timezone != null ? timezone : "Asia/Seoul";
        this.language = language != null ? language : "ko";
        this.dailyEnabled = false;
        this.dailySendHourUtc = 0;
        this.dailySendMinuteUtc = 0;
        this.weeklyEnabled = false;
        this.weeklySendHourUtc = 0;
        this.weeklySendMinuteUtc = 0;
        this.weeklyDayOfWeek = DayOfWeek.SATURDAY.getValue();
        this.sourceGithubEnabled = true;
        this.sourceKanbanEnabled = true;
        this.sourceConfluenceEnabled = true;
        this.shareLinkEnabled = true;
    }

    public void updateDaily(Boolean enabled, Integer hourUtc, Integer minuteUtc) {
        if (enabled != null) this.dailyEnabled = enabled;
        if (hourUtc != null) this.dailySendHourUtc = hourUtc;
        if (minuteUtc != null) this.dailySendMinuteUtc = minuteUtc;
    }

    public void updateWeekly(Boolean enabled, Integer hourUtc, Integer minuteUtc, Integer dayOfWeek) {
        if (enabled != null) this.weeklyEnabled = enabled;
        if (hourUtc != null) this.weeklySendHourUtc = hourUtc;
        if (minuteUtc != null) this.weeklySendMinuteUtc = minuteUtc;
        if (dayOfWeek != null) this.weeklyDayOfWeek = dayOfWeek;
    }

    public void updateCommon(String timezone, String language,
                             String slackChannelId, String slackChannelName) {
        if (timezone != null) this.timezone = timezone;
        if (language != null) this.language = language;
        this.slackChannelId = slackChannelId;
        this.slackChannelName = slackChannelName;
    }

    public void updateSources(Boolean github, Boolean kanban, Boolean confluence) {
        if (github != null) this.sourceGithubEnabled = github;
        if (kanban != null) this.sourceKanbanEnabled = kanban;
        if (confluence != null) this.sourceConfluenceEnabled = confluence;
    }

    public void updateShareLink(Boolean enabled) {
        if (enabled != null) this.shareLinkEnabled = enabled;
    }

    public void markDailySent(LocalDateTime sentAtUtc) {
        this.dailyLastSentAt = sentAtUtc;
    }

    public void markWeeklySent(LocalDateTime sentAtUtc) {
        this.weeklyLastSentAt = sentAtUtc;
    }
}
