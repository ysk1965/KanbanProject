package com.kanban.domain.report;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 보고서를 게시할 슬랙 채널 하나. {@link BoardReportConfig}당 여러 개를 둘 수 있다.
 *
 * <p>테스트 통과는 <b>채널마다</b> 기록한다({@link #testPassedAt}). 채널을 새로 추가하면 그 채널만
 * 테스트가 필요하고, 아직 확인되지 않은 채널이 섞인 채로 자동 예약이 켜지지 않는다 —
 * "잘못된 채널로 매일 자동 발송되는 사고"를 막던 기존 게이트를 채널 단위로 옮긴 것이다.
 */
@Entity
@Table(
    name = "board_report_channels",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_board_report_channel", columnNames = {"config_id", "slack_channel_id"}),
    indexes = @Index(name = "idx_board_report_channel_config", columnList = "config_id")
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ReportDeliveryChannel extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "config_id", nullable = false)
    private BoardReportConfig config;

    @Column(name = "slack_channel_id", nullable = false, length = 40)
    private String slackChannelId;

    @Column(name = "slack_channel_name", length = 100)
    private String slackChannelName;

    /** 화면에 보이는 순서. 0번이 대표 채널로, config의 미러 컬럼에도 반영된다. */
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    /** 이 채널로 테스트 게시가 성공한 시각. null이면 아직 확인되지 않았다. */
    @Column(name = "test_passed_at")
    private LocalDateTime testPassedAt;

    ReportDeliveryChannel(BoardReportConfig config, String channelId, String channelName, int sortOrder) {
        this.id = UUID.randomUUID().toString();
        this.config = config;
        this.slackChannelId = channelId;
        this.slackChannelName = (channelName == null || channelName.isBlank()) ? null : channelName;
        this.sortOrder = sortOrder;
    }

    void updateName(String channelName) {
        if (channelName != null && !channelName.isBlank()) {
            this.slackChannelName = channelName;
        }
    }

    void updateSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    void markTestPassed() {
        this.testPassedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public boolean isTestPassed() {
        return this.testPassedAt != null;
    }
}
