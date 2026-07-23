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
import java.time.LocalDateTime;
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

    /**
     * 사용자가 직접 생성한 보고서의 작성자. 스케줄러가 자동 생성한 보고서는 주체가 없어 null이다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "generated_by")
    private User generatedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "report_type", nullable = false, length = 20)
    private ReportType reportType;

    @Column(name = "target_user_id", length = 36)
    private String targetUserId;

    @Column(name = "target_user_name", length = 100)
    private String targetUserName;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;

    @Column(name = "content", columnDefinition = "TEXT", nullable = false)
    private String content;

    @Column(name = "data_snapshot", columnDefinition = "TEXT")
    private String dataSnapshot;

    /**
     * 자동 보고서의 구조화 본문(headline·metrics·sections·highlights·risks).
     * 슬랙 요약과 웹 페이지가 <b>이 한 벌에서 함께</b> 나오므로 AI 호출은 보고서당 1회다.
     * 수동 생성 보고서는 {@link #content}만 채워지고 이 값은 null이다.
     */
    @Column(name = "content_json", columnDefinition = "TEXT")
    private String contentJson;

    /** 소스별 수집 성공/실패 기록. 부분 실패를 보고서에 명시하기 위한 값. */
    @Column(name = "source_status_json", columnDefinition = "TEXT")
    private String sourceStatusJson;

    /** 로그인 없이 열리는 공유 주소 {@code /r/{shareToken}}의 토큰. 보드 설정에서 무효화할 수 있다. */
    @Column(name = "share_token", length = 64)
    private String shareToken;

    @Column(name = "share_expires_at")
    private LocalDateTime shareExpiresAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "last_regenerated_by")
    private User lastRegeneratedBy;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    @Builder
    public WeeklyReport(Board board, User generatedBy, ReportType reportType,
                        String targetUserId, String targetUserName,
                        LocalDate periodStart, LocalDate periodEnd,
                        String content, String dataSnapshot) {
        this.board = board;
        this.generatedBy = generatedBy;
        this.reportType = reportType;
        this.targetUserId = targetUserId;
        this.targetUserName = targetUserName;
        this.periodStart = periodStart;
        this.periodEnd = periodEnd;
        this.content = content;
        this.dataSnapshot = dataSnapshot;
    }

    public void updateContent(String content, String dataSnapshot, User regeneratedBy) {
        this.content = content;
        this.dataSnapshot = dataSnapshot;
        this.lastRegeneratedBy = regeneratedBy;
    }

    /**
     * 스케줄러가 자동 생성한 보고서. 생성 주체가 없으므로 {@code generatedBy}는 비운다.
     */
    public static WeeklyReport auto(Board board, ReportType reportType,
                                    LocalDate periodStart, LocalDate periodEnd,
                                    String content, String contentJson,
                                    String dataSnapshot, String sourceStatusJson,
                                    String shareToken, LocalDateTime shareExpiresAt) {
        WeeklyReport report = new WeeklyReport();
        report.board = board;
        report.reportType = reportType;
        report.periodStart = periodStart;
        report.periodEnd = periodEnd;
        report.content = content;
        report.contentJson = contentJson;
        report.dataSnapshot = dataSnapshot;
        report.sourceStatusJson = sourceStatusJson;
        report.shareToken = shareToken;
        report.shareExpiresAt = shareExpiresAt;
        return report;
    }

    /** 공유 링크 무효화 */
    public void revokeShareLink() {
        this.shareToken = null;
        this.shareExpiresAt = null;
    }

    public boolean isShareLinkValid(LocalDateTime nowUtc) {
        if (this.shareToken == null) {
            return false;
        }
        return this.shareExpiresAt == null || this.shareExpiresAt.isAfter(nowUtc);
    }
}
