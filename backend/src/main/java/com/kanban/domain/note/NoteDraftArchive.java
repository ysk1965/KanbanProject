package com.kanban.domain.note;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

/**
 * Preserves the Yjs state of a draft that was explicitly discarded (폐기) so it
 * can be restored (되돌리기). Discard would otherwise delete the single shared
 * {@link NoteCollabState} row, irreversibly losing everyone's unpublished work.
 *
 * One archive per note (latest discard wins). The Java backend has no Yjs CRDT
 * and cannot materialize the state, so the raw binary blob is stored verbatim.
 */
@Entity
@Table(name = "note_draft_archives")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class NoteDraftArchive {

    @Id
    @Column(name = "note_id", length = 36)
    private String noteId;

    // byte[] → PostgreSQL bytea. @Lob would map to oid (large object) and make
    // ddl-auto=update fail every boot trying to alter the existing bytea column.
    @JdbcTypeCode(SqlTypes.VARBINARY)
    @Column(name = "yjs_state")
    private byte[] yjsState;

    @Column(name = "discarded_by", length = 36)
    private String discardedBy;

    @Column(name = "discarded_at", nullable = false)
    private LocalDateTime discardedAt;

    @PrePersist
    @PreUpdate
    public void onSave() {
        this.discardedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void replace(byte[] state, String userId) {
        this.yjsState = state;
        this.discardedBy = userId;
    }
}
