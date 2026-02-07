package com.kanban.domain.report;

import com.kanban.domain.board.Board;
import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "weekly_reports")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WeeklyReport extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "generated_by", nullable = false)
    private User generatedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "report_type", nullable = false, length = 20)
    private ReportType reportType;

    @Column(name = "target_user_id", length = 36)
    private String targetUserId;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;

    @Column(name = "content", columnDefinition = "TEXT", nullable = false)
    private String content;

    @Column(name = "data_snapshot", columnDefinition = "TEXT")
    private String dataSnapshot;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    @Builder
    public WeeklyReport(Board board, User generatedBy, ReportType reportType,
                        String targetUserId, LocalDate periodStart, LocalDate periodEnd,
                        String content, String dataSnapshot) {
        this.board = board;
        this.generatedBy = generatedBy;
        this.reportType = reportType;
        this.targetUserId = targetUserId;
        this.periodStart = periodStart;
        this.periodEnd = periodEnd;
        this.content = content;
        this.dataSnapshot = dataSnapshot;
    }

    public void updateContent(String content, String dataSnapshot) {
        this.content = content;
        this.dataSnapshot = dataSnapshot;
    }
}
