package com.kanban.domain.integration.jira;

import com.kanban.domain.board.Board;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * "이미 가져온 이슈" 원장 — JIRA 이슈키 ↔ BRIDGE 엔티티 1:1 매핑.
 *
 * (board_id, jira_issue_key) UNIQUE 로 재가져오기 중복 방지,
 * jiraUpdatedAt 으로 증분 갱신 판정, writeBackDoneAt 으로 완료 역동기화 멱등.
 */
@Entity
@Table(name = "jira_issue_links", indexes = {
    @Index(name = "idx_jira_link_board", columnList = "board_id"),
    @Index(name = "idx_jira_link_target", columnList = "target_type, target_id"),
    @Index(name = "uq_jira_link_board_key", columnList = "board_id, jira_issue_key", unique = true)
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class JiraIssueLink {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "jira_issue_key", nullable = false, length = 50)
    private String jiraIssueKey;

    @Column(name = "jira_issue_id", length = 30)
    private String jiraIssueId;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false, length = 20)
    private JiraLinkTargetType targetType;

    /** 생성된 BRIDGE 엔티티 id (Feature/Task/ChecklistItem). */
    @Column(name = "target_id", nullable = false, length = 36)
    private String targetId;

    /** JIRA fields.updated 값 — 증분 판정 기준. */
    @Column(name = "jira_updated_at")
    private LocalDateTime jiraUpdatedAt;

    /** 직전 pull 시점의 JIRA status id — 반려("검토중→개발블록") 전환 감지용(Phase 4 옵션 B). */
    @Column(name = "last_jira_status_id", length = 30)
    private String lastJiraStatusId;

    /**
     * JIRA 이슈 타입 이름("버그"/"Story"…). 카드의 타입 표식용.
     * 이름을 그대로 두는 이유: 타입 집합이 프로젝트·언어마다 달라 enum으로 좁히면 못 담는 값이 생긴다.
     */
    @Column(name = "jira_issue_type", length = 60)
    private String jiraIssueType;

    /** JIRA 우선순위 이름("Highest"/"높음"…). 카드 표식 + 태그 재동기화의 직전 값. */
    @Column(name = "jira_priority", length = 60)
    private String jiraPriority;

    /**
     * JIRA 컴포넌트 이름들(콤마 결합). 우선순위와 함께 태그로 심기 때문에,
     * 다음 동기화에서 <b>어떤 태그를 떼야 하는지</b> 알려면 직전에 심은 값을 알고 있어야 한다.
     */
    @Column(name = "jira_component_names", length = 500)
    private String jiraComponentNames;

    /**
     * 직전에 관측한 JIRA 담당자 accountId(미배정이면 null).
     *
     * <p>담당자는 양쪽이 다 만지는 값이라, 현재 값만 봐서는 어긋남의 원인을 알 수 없다.
     * 직전 관측값을 들고 있어야 "JIRA가 움직였다"와 "BRIDGE에서 사람이 나눴다"를 가른다.
     */
    @Column(name = "jira_assignee_account_id", length = 128)
    private String jiraAssigneeAccountId;

    /**
     * 담당자 기준선을 기록한 시각. null이면 이 링크는 담당자 동기화를 한 번도 거치지 않았다는 뜻이라
     * 다음 동기화가 <b>관측만 하고 카드를 건드리지 않는다</b>.
     * (accountId 쪽은 "미배정"도 정상값이라 null로 둘 수 있어서, 유무 판정은 이 컬럼이 맡는다)
     */
    @Column(name = "assignee_synced_at")
    private LocalDateTime assigneeSyncedAt;

    /**
     * 이 이슈의 담당자를 대표하는 체크리스트 항목 id.
     *
     * <p>전에는 제목 접두사가 소유권 표식을 겸했는데, 사람이 항목 제목을 이슈 제목으로 바꿔 쓰면
     * 동기화가 그 항목을 못 찾고 담당 항목을 하나 더 만들었다. 표식을 여기로 옮겨 이름을 바꿔도
     * 소유권이 유지되게 한다 — 접두사는 이제 표시 기본값일 뿐이다.
     *
     * <p>null이면 아직 이어진 항목이 없다는 뜻이고, 그때만 접두사로 찾는 옛 경로를 쓴다.
     */
    @Column(name = "jira_assignee_item_id", length = 36)
    private String jiraAssigneeItemId;

    /**
     * 표식된 담당 항목이 <b>사람 손으로 사라진</b> 시각(항목 삭제·다른 카드로 이동).
     *
     * <p>표식만 걷어 내면 "원래 없음"과 "지웠음"이 구분되지 않아, 다음 JIRA 담당자 변경이
     * 지운 항목을 도로 만들어 낸다(실제로 그렇게 됐다 — 지워도 폴링마다 부활). non-null이면
     * 동기화는 담당 항목을 새로 만들지 않고 관측만 한다. 사람이 "담당: " 접두사 항목을
     * 직접 만들면 그 항목을 입양하면서 이 기록을 지운다 — 재생성으로 돌아오는 길이다.
     */
    @Column(name = "assignee_item_detached_at")
    private LocalDateTime assigneeItemDetachedAt;

    @Column(name = "last_imported_at", nullable = false)
    private LocalDateTime lastImportedAt;

    /** 완료 역동기화 완료 시각 — non-null 이면 이미 JIRA로 넘긴 것(멱등). */
    @Column(name = "write_back_done_at")
    private LocalDateTime writeBackDoneAt;

    /**
     * JIRA 원본 이슈가 삭제된 시각(soft-unlink). non-null이면 연동이 끊긴 상태로,
     * pull/push/write-back 대상에서 제외되고 카드에 "JIRA 삭제됨" 뱃지가 붙는다.
     * 행을 지우지 않는 이유: 이슈키를 남겨 어떤 이슈였는지 보여주고, 폴링이 매번
     * 같은 키를 신규로 재생성하는 것을 막기 위함.
     */
    @Column(name = "jira_deleted_at")
    private LocalDateTime jiraDeletedAt;

    /**
     * 소속 마일스톤 스코프({@link JiraMilestoneScope}) id. null = 보드 기본(전체 뷰 소속).
     *
     * <p>동기화의 claim 패스가 스코프 JQL 결과로 채우고 비운다. 두 스코프의 JQL이 겹치면
     * 먼저 가져간 쪽이 유지된다(빼앗지 않음) — 소속이 폴링마다 좌우로 튀는 것을 막는다.
     */
    @Column(name = "scope_id", length = 36)
    private String scopeId;

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
        if (this.lastImportedAt == null) this.lastImportedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    // ── 도메인 메서드 ──────────────────────────────

    /** 재가져오기 시 대상/타임스탬프 갱신. */
    public void touchImport(JiraLinkTargetType targetType, String targetId, LocalDateTime jiraUpdatedAt) {
        this.targetType = targetType;
        this.targetId = targetId;
        this.jiraUpdatedAt = jiraUpdatedAt;
        this.lastImportedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void markWriteBackDone() {
        this.writeBackDoneAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    /** 직전 JIRA status 기록(반려 전환 감지용). pull 반영 후 호출. */
    public void markJiraStatus(String statusId) {
        this.lastJiraStatusId = statusId;
    }

    /**
     * JIRA 이슈 메타 기록 — 카드 표시값이자, 다음 재동기화가 낡은 태그를 떼는 기준이 된다.
     * 태그 반영과 <b>같은 시점에</b> 호출해야 한다. 여기만 앞서 나가면 떼지 못한 태그가 남는다.
     */
    public void applyIssueMeta(String issueType, String priority, String componentNames) {
        this.jiraIssueType = issueType;
        this.jiraPriority = priority;
        this.jiraComponentNames = componentNames;
    }

    /**
     * 이 링크가 이슈 메타를 아직 한 번도 기록한 적이 없는지 — 이 기능 이전에 만들어진 링크.
     * 이슈 타입은 JIRA에서 항상 채워지므로 이 값이 비어 있으면 미기록으로 본다.
     */
    public boolean needsIssueMetaBackfill() {
        return this.jiraIssueType == null;
    }

    /**
     * 담당자 기준선 갱신 — JIRA를 관측했을 때와 BRIDGE에서 JIRA로 밀어 넣었을 때 모두 호출한다.
     * push 직후에 부르는 것이 에코 차단이다. 부르지 않으면 다음 pull이 방금 우리가 만든 변경을
     * "JIRA가 움직였다"고 읽고 되받아친다.
     */
    public void applyAssignee(String jiraAccountId) {
        this.jiraAssigneeAccountId = jiraAccountId;
        this.assigneeSyncedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    /**
     * 담당자를 대표하는 항목을 지정. 제목이 아니라 이 값이 소유권이다.
     * 새 항목이 이어지면 "지웠음" 기록도 함께 걷는다 — 사람이 항목을 되살렸다는 뜻이므로.
     */
    public void linkAssigneeItem(String checklistItemId) {
        this.jiraAssigneeItemId = checklistItemId;
        if (checklistItemId != null) this.assigneeItemDetachedAt = null;
    }

    /**
     * 표식된 담당 항목이 사람 손으로 사라졌음을 기록(항목 삭제·다른 카드로 이동).
     * 표식은 걷되 시각을 남겨, 이후 JIRA 담당자가 바뀌어도 항목을 재생성하지 않게 한다.
     */
    public void markAssigneeItemDetached() {
        this.jiraAssigneeItemId = null;
        this.assigneeItemDetachedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    /** 사람이 담당 항목을 지운 카드인지 — 그렇다면 동기화는 항목을 다시 만들지 않는다. */
    public boolean isAssigneeItemDetached() {
        return this.assigneeItemDetachedAt != null;
    }

    /** 담당자 기준선이 아직 없음 — 이번 관측은 기록만 하고 카드는 그대로 둔다. */
    public boolean needsAssigneeBaseline() {
        return this.assigneeSyncedAt == null;
    }

    /** 들어온 JIRA 담당자가 직전 관측값과 다른지 — 다르면 JIRA 쪽이 실제로 움직인 것. */
    public boolean jiraAssigneeChanged(String incomingAccountId) {
        return !java.util.Objects.equals(this.jiraAssigneeAccountId, incomingAccountId);
    }

    /** JIRA 원본이 삭제됨 — 연동 해제 표시(멱등). */
    public void markJiraDeleted() {
        if (this.jiraDeletedAt == null) {
            this.jiraDeletedAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    /** 같은 키의 이슈가 JIRA에 다시 나타남(복구/재생성) — 삭제 표시 해제. */
    public void clearJiraDeleted() {
        this.jiraDeletedAt = null;
    }

    public boolean isJiraDeleted() {
        return this.jiraDeletedAt != null;
    }

    /** 스코프 소속 지정 — claim 패스 전용. null이면 보드 기본으로 되돌아간다. */
    public void assignScope(String scopeId) {
        this.scopeId = scopeId;
    }

    /** JIRA가 BRIDGE 원장보다 최신인지 — 증분 갱신 판정. */
    public boolean isStaleAgainst(LocalDateTime incomingJiraUpdatedAt) {
        if (incomingJiraUpdatedAt == null) return false;
        if (this.jiraUpdatedAt == null) return true;
        return incomingJiraUpdatedAt.isAfter(this.jiraUpdatedAt);
    }
}
