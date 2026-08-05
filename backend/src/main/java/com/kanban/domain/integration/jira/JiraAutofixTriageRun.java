package com.kanban.domain.integration.jira;

import com.kanban.domain.board.Board;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 트리아지 실행 1회 = 1행.
 *
 * <p>트리아지는 이슈 15건마다 AI를 한 번 부르므로 100건이면 수 분이 걸린다. 요청 스레드에서
 * 끝까지 돌면 ALB idle timeout(90s)에 걸려 504가 나고, 그때 실제 판정은 서버에서 계속 도는데
 * 화면은 실패로 보인다 — 사람이 다시 누르면 AI 호출만 두 배가 된다.
 *
 * <p>그래서 실행은 백그라운드로 보내고 진행률을 여기에 적는다. 인스턴스가 최대 2대라
 * 메모리에 두면 폴링이 다른 인스턴스에 붙는 순간 "실행 중인 게 없다"고 답한다.
 *
 * <p>보드당 동시 1건만 돈다. 같은 이슈를 두 실행이 동시에 판정하면 AI 비용이 두 배로 나가고
 * 나중에 끝난 쪽이 이긴다 — 어느 쪽이 이겼는지는 아무도 모른다.
 */
@Entity
@Table(name = "jira_autofix_triage_runs", indexes = {
    @Index(name = "idx_jira_autofix_triage_run_board", columnList = "board_id, started_at DESC")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder(access = AccessLevel.PRIVATE)
public class JiraAutofixTriageRun {

    /**
     * 살아 있는 실행으로 인정하는 최대 무응답 시간(분).
     *
     * <p>배포·인스턴스 교체로 실행 중이던 스레드가 사라지면 RUNNING 행이 그대로 남아 보드의
     * 트리아지가 영원히 막힌다. 배치 하나가 이 시간을 넘기는 일은 없으므로(15건 판정에 수십 초),
     * 이만큼 조용하면 죽은 것으로 본다.
     */
    private static final long STALE_MINUTES = 15;

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private AutofixTriageRunStatus status;

    /** 보드에서 발견한 JIRA 연동 태스크 총 수. */
    @Column(name = "scanned", nullable = false)
    private int scanned;

    /** 이번 실행이 판정할 대상 수 — 진행률의 분모. */
    @Column(name = "total", nullable = false)
    private int total;

    /** 지금까지 반영된 판정 수 — 진행률의 분자. */
    @Column(name = "triaged", nullable = false)
    private int triaged;

    /** 직전 판정 이후 이슈가 안 바뀌어 건너뛴 수. */
    @Column(name = "skipped", nullable = false)
    private int skipped;

    /** 실패한 배치 수. 0이 아니면 결과가 부분이다. */
    @Column(name = "failed_batches", nullable = false)
    private int failedBatches;

    /** 이슈키를 지정해 좁혀 돌린 실행인지. 끝났을 때 화면 문구가 갈린다. */
    @Column(name = "scoped", nullable = false)
    private boolean scoped;

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @Column(name = "started_by", length = 36)
    private String startedBy;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    /** 심장박동. 배치마다 갱신되고, 멈추면 죽은 실행으로 본다. */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    public static JiraAutofixTriageRun start(Board board, String userId, int scanned, int total,
                                             int skipped, boolean scoped) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        return JiraAutofixTriageRun.builder()
                .id(UUID.randomUUID().toString())
                .board(board)
                .status(AutofixTriageRunStatus.RUNNING)
                .scanned(scanned)
                .total(total)
                .triaged(0)
                .skipped(skipped)
                .failedBatches(0)
                .scoped(scoped)
                .startedBy(userId)
                .startedAt(now)
                .updatedAt(now)
                .build();
    }

    /** 배치 하나가 끝날 때마다. 화면이 보는 유일한 진척 신호라 배치마다 반드시 남긴다. */
    public void progress(int triagedDelta, boolean batchFailed) {
        this.triaged += triagedDelta;
        if (batchFailed) this.failedBatches++;
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void succeed() {
        this.status = AutofixTriageRunStatus.SUCCEEDED;
        this.finishedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.updatedAt = this.finishedAt;
    }

    public void fail(String message) {
        this.status = AutofixTriageRunStatus.FAILED;
        this.errorMessage = message != null && message.length() > 500
                ? message.substring(0, 500) : message;
        this.finishedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.updatedAt = this.finishedAt;
    }

    public boolean isRunning() {
        return status == AutofixTriageRunStatus.RUNNING;
    }

    /**
     * 실행 중으로 적혀 있지만 심장박동이 멎은 상태. 배포로 스레드가 날아간 경우가 이렇다 —
     * 이걸 살아 있다고 보면 보드의 트리아지가 다시는 돌지 않는다.
     */
    public boolean isStale() {
        return isRunning()
                && updatedAt.isBefore(LocalDateTime.now(ZoneOffset.UTC).minusMinutes(STALE_MINUTES));
    }
}
