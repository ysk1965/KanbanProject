package com.kanban.domain.report;

import com.kanban.domain.board.Board;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 자동 보고서가 슬랙에 실제로 게시한 메시지 한 건(채널 + ts).
 *
 * <p>한 보고서는 여러 채널로 나가므로 {@code report_id : row = 1 : N}이다. 보고서를 삭제할 때
 * 이 기록으로 {@code chat.delete}를 호출해 슬랙에 남은 메시지까지 회수한다. 회수 후에는
 * 보고서와 함께 이 행도 지운다({@code report_id}로 명시 삭제).
 *
 * <p>{@code report_id}는 FK가 아니라 단순 컬럼이다 — 회수는 "메시지 삭제 → 행 삭제 → 보고서 삭제"
 * 순서로 도는데, FK 제약이 걸려 있으면 이 순서에서 삭제가 막힐 수 있어서다.
 */
@Entity
@Table(
    name = "report_dispatch_messages",
    indexes = {
        @Index(name = "idx_report_dispatch_report", columnList = "report_id"),
        @Index(name = "idx_report_dispatch_board", columnList = "board_id")
    }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ReportDispatchMessage {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    /** 어떤 보고서가 보낸 메시지인지. FK 아님(회수 삭제 순서 때문). */
    @Column(name = "report_id", nullable = false, length = 36)
    private String reportId;

    @Column(name = "channel_id", nullable = false, length = 40)
    private String channelId;

    @Column(name = "channel_name")
    private String channelName;

    /** 슬랙 메시지 타임스탬프. chat.delete에 채널과 함께 필요하다. */
    @Column(name = "message_ts", nullable = false, length = 40)
    private String messageTs;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    @Builder
    public ReportDispatchMessage(Board board, String reportId, String channelId,
                                 String channelName, String messageTs) {
        this.board = board;
        this.reportId = reportId;
        this.channelId = channelId;
        this.channelName = channelName;
        this.messageTs = messageTs;
    }
}
