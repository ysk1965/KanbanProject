package com.kanban.domain.integration.atlassian;

import com.kanban.domain.board.Board;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Atlassian 계정(accountId) ↔ BRIDGE 멤버 매핑.
 *
 * <p>Confluence 문서의 작성/수정자는 {@code accountId}로만 온다. 그 값을 그대로 보고서에 실으면
 * 사람 이름 자리에 {@code 70121:24b5829d-...} 가 박히므로, 한 번 해결한 결과를 여기 저장해
 * 이후 수집은 DB 조회만으로 이름을 붙인다.
 *
 * <p>accountId는 Jira·Confluence가 공유하는 <b>조직 단위</b> 식별자다. 그래서 이 표는 두 제품
 * 모두에 쓸 수 있고, 기존 {@code jira_user_mappings}에 이미 이어진 계정은 그대로 승격해 재사용한다.
 *
 * <p>{@link #bridgeUser}가 null이면 "보드 멤버로는 이어지지 않은 계정"(외부 편집자 등)이다.
 * 그 경우에도 {@link #displayName}은 채워 두어 보고서에 사람 이름이 보이게 하고, 같은 계정을
 * 매번 다시 조회하지 않도록 캐시 구실을 한다.
 */
@Entity
@Table(name = "atlassian_user_mappings", indexes = {
    @Index(name = "idx_atlassian_user_map_board", columnList = "board_id"),
    @Index(name = "uq_atlassian_user_map_board_account",
           columnList = "board_id, account_id", unique = true)
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AtlassianUserMapping {

    /** 어떤 경로로 이어졌는지 — 진단용. 이메일이 가장 정확하고, 이름 일치는 동명이인 위험이 있다. */
    public enum ResolvedBy {
        /** 멤버 이메일로 Atlassian 사용자 검색에 성공 — 가장 정확 */
        EMAIL,
        /** 기존 JIRA 사용자 매핑에서 승격 */
        JIRA,
        /** Confluence 표시 이름이 보드 멤버 이름과 일치 */
        DISPLAY_NAME,
        /** 멤버로 잇지 못함. 이름만 알거나 그마저도 모름 */
        UNRESOLVED
    }

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "account_id", nullable = false, length = 128)
    private String accountId;

    /** Confluence/Jira 표시 이름. 멤버로 못 이어도 이 값은 보고서에 쓴다. */
    @Column(name = "display_name", length = 200)
    private String displayName;

    /** 매핑된 BRIDGE 멤버. null = 보드 멤버로 잇지 못함(외부 편집자 등). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bridge_user_id")
    private User bridgeUser;

    @Enumerated(EnumType.STRING)
    @Column(name = "resolved_by", nullable = false, length = 20)
    @Builder.Default
    private ResolvedBy resolvedBy = ResolvedBy.UNRESOLVED;

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
        if (this.resolvedBy == null) this.resolvedBy = ResolvedBy.UNRESOLVED;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    /**
     * 더 나은 근거로 다시 이어졌을 때 갱신한다. 이름은 새 값이 있을 때만 덮어쓴다 —
     * 이미 알던 이름을 null로 지우지 않기 위해서다.
     */
    public void relink(User bridgeUser, String displayName, ResolvedBy resolvedBy) {
        this.bridgeUser = bridgeUser;
        if (displayName != null && !displayName.isBlank()) {
            this.displayName = displayName;
        }
        this.resolvedBy = resolvedBy != null ? resolvedBy : ResolvedBy.UNRESOLVED;
    }
}
