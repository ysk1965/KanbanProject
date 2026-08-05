package com.kanban.domain.integration.jira;

import com.kanban.domain.board.Board;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 자동수정 작업 큐 — 대상 1건당 1행.
 *
 * <p><b>이 테이블은 JIRA 전용이 아니다.</b> 이름이 {@code jira_autofix_jobs}인 것은 처음 만들 때
 * JIRA 이슈만 다뤘기 때문이고, 지금은 사람이 직접 맡긴 태스크·체크리스트 항목도 같은 큐를 흐른다.
 * 큐를 나누지 않는 이유는 <b>직렬 보장이 테이블 하나 안에서 성립해야</b> 하기 때문이다 — 실행 주체는
 * Unity Editor가 떠 있는 맥 한 대뿐인데, 큐가 둘이면 서로의 사정을 모른 채 각자 한 건씩 내준다.
 *
 * <p>대상(저장소·브랜치)을 큐에 담는 시점에 <b>스냅샷</b>한다. 보드의 저장소 연결이 나중에 바뀌어도
 * 이미 큐에 있는 작업이 엉뚱한 저장소에 PR을 열지 않게 하기 위함이다.
 *
 * <p>작업은 BRIDGE가 밀어 넣지 않는다 — 맥의 러너가 {@code claim}으로 가져간다. 러너 쪽이 언제
 * 여유가 있는지는 러너만 알고, 그 정보를 서버가 추측하면 실행 중인데 또 보내는 사고가 난다.
 */
@Entity
@Table(name = "jira_autofix_jobs", indexes = {
    @Index(name = "idx_jira_autofix_job_board", columnList = "board_id"),
    @Index(name = "idx_jira_autofix_job_status", columnList = "board_id, status"),
    @Index(name = "idx_jira_autofix_job_key", columnList = "board_id, job_key"),
    @Index(name = "idx_jira_autofix_job_kind", columnList = "board_id, job_kind, status"),
    @Index(name = "idx_jira_autofix_job_task", columnList = "board_id, task_id"),
    @Index(name = "idx_jira_autofix_job_checklist", columnList = "board_id, checklist_item_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder(access = AccessLevel.PRIVATE)
public class JiraAutofixJob {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    /**
     * 사람이 읽는 작업 식별자. 접두사가 위임 범위를 말한다 —
     * {@code QASA-40}(JIRA 이슈) / {@code TASK-a1b2c3d4}(태스크 전체) / {@code CHK-7f0e21b9}(항목).
     */
    @Column(name = "job_key", nullable = false, length = 50)
    private String jobKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "job_kind", nullable = false, length = 10)
    @Builder.Default
    private AutofixJobKind jobKind = AutofixJobKind.JIRA;

    /**
     * 원본 BRIDGE 태스크. MANUAL은 항상 채워진다 — 체크리스트 항목을 맡겨도
     * 프롬프트 맥락은 부모 태스크에서 나온다.
     */
    @Column(name = "task_id", length = 36)
    private String taskId;

    /**
     * 위임 범위. null이면 태스크 전체, 값이 있으면 그 체크리스트 항목만 고친다.
     *
     * <p>{@code target_type} 열거형을 두지 않은 이유: 체크리스트 항목은 태스크 없이 존재할 수 없고,
     * 지시문 조립에 부모 태스크가 <b>항상</b> 필요하다. 열거형으로 나누면 "항목이면 부모를 조회한다"는
     * 분기가 큐·프롬프트·통지·화면 네 곳에 각각 생긴다.
     */
    @Column(name = "checklist_item_id", length = 36)
    private String checklistItemId;

    /** 사람이 쓴 지시문. MANUAL만 채워진다 — JIRA는 이슈 본문에서 조립한다. */
    @Column(name = "instruction", columnDefinition = "TEXT")
    private String instruction;

    /** 누가 맡겼는가. 임의 지시문이 맥에서 실행되므로 감사 경로가 필요하다. */
    @Column(name = "created_by", length = 36)
    private String createdBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private AutofixJobStatus status = AutofixJobStatus.QUEUED;

    /** 트리아지 confidence 스냅샷 — 큐 우선순위. MANUAL은 null이다(점수가 없다). */
    @Column(name = "confidence")
    private Double confidence;

    // ── 대상 스냅샷 ──

    @Column(name = "installation_id", length = 40)
    private String installationId;

    @Column(name = "repo_full_name", length = 200)
    private String repoFullName;

    @Column(name = "base_ref", length = 200)
    private String baseRef;

    /**
     * 서버가 정한 작업 브랜치. 큐에 담을 때 확정한다 — 매번 조립하면 러너가 실제로 push한 브랜치와
     * 화면이 어긋날 여지가 생기고, job id를 섞지 않으면 재시도가 remote와 non-fast-forward로 부딪힌다.
     */
    @Column(name = "branch_name", length = 200)
    private String branchName;

    /** 이 작업을 가져간 러너. 여러 대를 붙일 일은 없지만, 어느 맥이 물고 있는지는 알아야 한다. */
    @Column(name = "runner_name", length = 100)
    private String runnerName;

    // ── 결과 ──

    @Column(name = "pr_url", length = 500)
    private String prUrl;

    /** 실패 사유. 러너가 보낸 값이라 신뢰하지 않고 길이를 자른다. */
    @Column(name = "failure_reason", length = 1000)
    private String failureReason;

    /**
     * 에이전트 로그 꼬리. GitHub Actions를 걷어내면서 "실행 로그 링크"가 사라졌으므로,
     * 실패 원인을 화면에서 볼 수 있는 유일한 경로다.
     */
    @Column(name = "log_excerpt", columnDefinition = "TEXT")
    private String logExcerpt;

    @Column(name = "queued_at", nullable = false)
    private LocalDateTime queuedAt;

    @Column(name = "dispatched_at")
    private LocalDateTime dispatchedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (this.createdAt == null) this.createdAt = now;
        if (this.updatedAt == null) this.updatedAt = now;
        if (this.queuedAt == null) this.queuedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    // ── 생성 ───────────────────────────────────────
    //
    // 빌더를 열어두지 않는다. 열어두면 MANUAL인데 confidence가 들어가거나, 체크리스트 항목만 있고
    // 부모 태스크가 비어 있는(맥락 없이 제목 한 줄만 나가는) 조합이 만들어진다.
    //
    // id를 여기서 부여한다. @PrePersist까지 미루면 assignTarget()이 브랜치 이름을 만들 때
    // id가 아직 null이라 모든 작업의 브랜치가 같아진다 — 재시도가 곧바로 push 충돌로 이어진다.

    /** 트리아지가 고른 JIRA 이슈. */
    public static JiraAutofixJob forJiraIssue(Board board, String issueKey, String taskId, Double confidence) {
        return JiraAutofixJob.builder()
                .id(UUID.randomUUID().toString())
                .board(board)
                .jobKey(issueKey)
                .jobKind(AutofixJobKind.JIRA)
                .taskId(taskId)
                .confidence(confidence)
                .status(AutofixJobStatus.QUEUED)
                .build();
    }

    /** 사람이 태스크 하나를 통째로 맡긴 작업. */
    public static JiraAutofixJob forManualTask(Board board, String taskId, String instruction, String createdBy) {
        return JiraAutofixJob.builder()
                .id(UUID.randomUUID().toString())
                .board(board)
                .jobKey("TASK-" + shortId(taskId))
                .jobKind(AutofixJobKind.MANUAL)
                .taskId(taskId)
                .instruction(instruction)
                .createdBy(createdBy)
                .status(AutofixJobStatus.QUEUED)
                .build();
    }

    /**
     * 사람이 체크리스트 항목 하나를 맡긴 작업. 부모 태스크가 반드시 함께 온다 —
     * {@code ChecklistItem}에는 설명 필드가 없어 제목 한 줄이 전부라, 맥락은 태스크가 채운다.
     */
    public static JiraAutofixJob forManualChecklistItem(Board board, String taskId, String checklistItemId,
                                                        String instruction, String createdBy) {
        return JiraAutofixJob.builder()
                .id(UUID.randomUUID().toString())
                .board(board)
                .jobKey("CHK-" + shortId(checklistItemId))
                .jobKind(AutofixJobKind.MANUAL)
                .taskId(taskId)
                .checklistItemId(checklistItemId)
                .instruction(instruction)
                .createdBy(createdBy)
                .status(AutofixJobStatus.QUEUED)
                .build();
    }

    /** id 앞부분만 — 사람이 읽는 식별자에 UUID 전체를 넣으면 화면에서 제목을 밀어낸다. */
    private static String shortId(String id) {
        if (id == null) return "unknown";
        String compact = id.replace("-", "");
        return compact.length() <= 8 ? compact : compact.substring(0, 8);
    }

    // ── 도메인 메서드 ──────────────────────────────

    /**
     * 러너가 이 작업을 가져갔다. 가져간 시각이 곧 시작 시각이다 — 밀어 넣는 방식과 달리
     * "보냈지만 아직 시작 안 됨" 구간이 없다.
     */
    public void markClaimed(String runnerName) {
        this.status = AutofixJobStatus.DISPATCHED;
        this.dispatchedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.runnerName = runnerName;
    }

    /** 러너 콜백 반영. 이미 종료된 작업이면 무시한다(콜백 중복 수신 방지). */
    public boolean complete(AutofixJobStatus result, String prUrl, String failureReason, String logExcerpt) {
        if (this.status.isTerminal()) return false;
        this.status = result;
        this.prUrl = prUrl;
        this.failureReason = failureReason;
        if (logExcerpt != null) this.logExcerpt = logExcerpt;
        this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
        return true;
    }

    public void markTimedOut() {
        this.status = AutofixJobStatus.TIMED_OUT;
        this.failureReason = "러너 콜백이 시간 안에 오지 않았습니다";
        this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    /**
     * 회수된 뒤 늦게 도착한 회신으로 결과를 바로잡는다.
     *
     * <p>{@code TIMED_OUT}은 "러너가 죽었다고 <b>추정</b>했다"는 뜻이지 사실 확인이 아니다.
     * 러너가 살아서 PR까지 만들어 놓고 회신만 유실된 경우가 실제로 있고, 그대로 두면 보드는
     * 실패라고 말하는데 GitHub에는 아무도 모르는 PR이 열려 있게 된다. 게다가
     * {@code existsActiveForIssue}가 종료 상태까지 "이미 처리함"으로 세기 때문에 그 이슈는
     * 사람이 작업을 취소하기 전까지 다시 큐에 담기지도 않는다 — 추정 하나로 이슈가 영구히 빠진다.
     *
     * <p>그래서 이 경로만은 터미널 상태를 되돌린다. 대상은 {@code TIMED_OUT} 하나뿐이다.
     * 사람이 취소한 건이나 이미 확정된 결과는 늦은 회신으로 흔들리면 안 된다.
     */
    public boolean reconcileAfterTimeout(AutofixJobStatus result, String prUrl,
                                         String failureReason, String logExcerpt) {
        if (this.status != AutofixJobStatus.TIMED_OUT) return false;
        this.status = result;
        this.prUrl = prUrl;
        this.failureReason = failureReason;
        if (logExcerpt != null) this.logExcerpt = logExcerpt;
        this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
        return true;
    }

    public boolean cancel() {
        if (this.status != AutofixJobStatus.QUEUED) return false;   // 이미 나간 건 되돌릴 수 없다
        this.status = AutofixJobStatus.CANCELLED;
        this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
        return true;
    }

    /**
     * 러너가 물고 있는 작업을 강제로 놓아준다 — 직렬 보장 때문에 DISPATCHED 한 건이 그 보드의 큐
     * 전체를 막으므로, 러너 쪽이 죽어 콜백이 오지 않을 때 타임아웃 회수까지 기다릴 수단이 없으면
     * 사람이 할 수 있는 일이 없어진다.
     *
     * <p>맥에서 돌고 있는 실제 작업을 멈추지는 못한다. 늦게 도착한 콜백은 이미 종료된 작업을
     * 덮지 못해 무시되고, CANCELLED이므로 같은 대상을 다시 담을 수 있다.
     */
    public boolean release() {
        if (this.status != AutofixJobStatus.DISPATCHED) return false;
        this.status = AutofixJobStatus.CANCELLED;
        this.failureReason = "진행 중이던 작업을 강제로 회수했습니다";
        this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
        return true;
    }

    /**
     * 실패로 끝난 작업을 <b>다시 담을 수 있게</b> 비운다.
     *
     * <p>필요한 이유는 "이슈당 1회" 가드({@code existsActiveForIssue})가 {@code CANCELLED} 외의
     * 모든 상태를 "이미 처리함"으로 세기 때문이다. 그래서 러너 쪽 사고로 한 번 실패하면
     * — 스크립트가 낡았든 맥이 잠들었든 — 그 대상은 사람이 손쓸 방법 없이 자동수정에서 영구히
     * 빠진다. {@code TIMED_OUT}은 특히 "러너가 죽었다고 <b>추정</b>했다"는 뜻일 뿐인데,
     * 추정 하나가 되돌릴 수 없는 결과를 만든다.
     *
     * <p>대상은 실패 계열 둘뿐이다. {@code SUCCEEDED}는 PR이 실제로 열려 있어 다시 담으면
     * 같은 대상에 PR이 두 개 생기고, {@code NO_CHANGE}는 에이전트가 판단을 마친 정상 종료다 —
     * 둘 다 사고가 아니므로 잠가 둔다.
     */
    public boolean discardForRetry() {
        if (this.status != AutofixJobStatus.TIMED_OUT && this.status != AutofixJobStatus.FAILED) {
            return false;
        }
        this.status = AutofixJobStatus.CANCELLED;
        this.failureReason = "실패한 작업을 비웠습니다 (다시 담을 수 있습니다)";
        this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
        return true;
    }

    /**
     * 대상 저장소와 브랜치를 확정한다.
     *
     * <p>브랜치에 job id를 섞는 이유는 재시도 때문이다 — 실패한 작업의 지시문을 고쳐 다시 맡기는
     * 것이 수동 위임의 정상 흐름인데, 브랜치 이름이 대상 키로만 정해지면 remote에 남은 이전
     * 브랜치와 non-fast-forward로 부딪혀 push가 실패한다. (같은 문제가 강제 회수된 JIRA 작업을
     * 다시 담을 때도 잠재해 있었다.)
     */
    public void assignTarget(String installationId, String repoFullName, String baseRef) {
        this.installationId = installationId;
        this.repoFullName = repoFullName;
        this.baseRef = baseRef;
        if (this.branchName == null) {
            this.branchName = "autofix/" + this.jobKey + "-" + shortId(this.id).substring(0, 6);
        }
    }

    /** 프롬프트 맥락이 체크리스트 항목 하나로 좁혀지는가. */
    public boolean isChecklistScoped() {
        return this.checklistItemId != null;
    }
}
