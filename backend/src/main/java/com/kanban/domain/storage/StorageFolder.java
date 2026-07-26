package com.kanban.domain.storage;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 스토리지 폴더 (마이스페이스 개인 파일 보관함의 폴더 트리).
 * 노트의 owner-스코프 + self-referencing 트리 패턴을 채택한다.
 * board/organization 컬럼은 향후 확장을 위해 두되 1차 구현은 owner(개인) 스코프만 사용.
 */
@Entity
@Table(name = "storage_folder",
        indexes = {
                @Index(name = "idx_storage_folder_owner", columnList = "owner_user_id"),
                @Index(name = "idx_storage_folder_parent", columnList = "parent_id")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class StorageFolder extends BaseTimeEntity {

    private static final int MAX_DEPTH = 4;

    @Id
    @Column(name = "id", length = 36)
    private String id;

    /** 개인(마이 스페이스) 소유자. board/organization 과 상호배타적. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_user_id")
    private User owner;

    @Column(name = "board_id", length = 36)
    private String boardId;

    @Column(name = "organization_id", length = 36)
    private String organizationId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private StorageFolder parent;

    @Column(name = "name", nullable = false, length = 255)
    private String name;

    /**
     * 시스템이 관리하는 폴더의 식별자. {@code REPORT_ROOT} · {@code REPORT_MONTH:2026-07} ·
     * {@code REPORT_UNSORTED}. 이름이 아니라 이 키로 찾으므로 사용자가 폴더 이름을 바꿔도 안전하다.
     * 사용자가 만든 폴더는 null.
     */
    @Column(name = "system_key", length = 60)
    private String systemKey;

    /**
     * 이 폴더를 소유한 보고서(weekly_reports.id). 보고서를 지우면 이 폴더도 휴지통으로 내려간다.
     * 보고서는 하드 삭제되고 폴더는 휴지통에 남아야 하므로 FK 없는 느슨한 참조로 둔다.
     */
    @Column(name = "report_id", length = 36)
    private String reportId;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @Column(name = "depth", nullable = false)
    @Builder.Default
    private Integer depth = 0;

    @Column(name = "share_token", length = 36, unique = true)
    private String shareToken;

    @Column(name = "share_code", length = 16, unique = true)
    private String shareCode;

    @Column(name = "is_shared", nullable = false)
    @Builder.Default
    private Boolean isShared = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by", nullable = false)
    private User updatedBy;

    @Column(name = "is_deleted", nullable = false)
    @Builder.Default
    private Boolean isDeleted = false;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "deleted_by_id")
    private User deletedBy;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void rename(String name, User actor) {
        if (name != null && !name.isBlank()) {
            this.name = name;
            this.updatedBy = actor;
        }
    }

    public void moveTo(StorageFolder newParent, int newPosition) {
        this.parent = newParent;
        this.position = newPosition;
        this.depth = newParent != null ? newParent.getDepth() + 1 : 0;
    }

    public void updatePosition(int position) {
        this.position = position;
    }

    /**
     * 주인 보고서와의 연결을 끊는다. 보고서를 삭제할 때 폴더는 휴지통에 남기므로,
     * 이미 사라진 보고서를 가리키는 참조를 남기지 않기 위해 호출한다.
     */
    public void detachReport() {
        this.reportId = null;
    }

    public void softDelete(User actor) {
        this.isDeleted = true;
        this.deletedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.deletedBy = actor;
    }

    public void restore() {
        this.isDeleted = false;
        this.deletedAt = null;
        this.deletedBy = null;
    }

    public String enableShare() {
        this.isShared = true;
        if (this.shareToken == null) {
            this.shareToken = UUID.randomUUID().toString();
        }
        if (this.shareCode == null) {
            this.shareCode = ShareCodes.generate();
        }
        return this.shareCode;
    }

    public void disableShare() {
        this.isShared = false;
        this.shareToken = null;
        this.shareCode = null;
    }

    public boolean canHaveChildren() {
        return this.depth < MAX_DEPTH;
    }

    public static int getMaxDepth() {
        return MAX_DEPTH;
    }
}
