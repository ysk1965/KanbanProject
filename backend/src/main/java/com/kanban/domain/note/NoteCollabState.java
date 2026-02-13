package com.kanban.domain.note;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Entity
@Table(name = "note_collab_states")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class NoteCollabState {

    @Id
    @Column(name = "note_id", length = 36)
    private String noteId;

    @Lob
    @Column(name = "yjs_state")
    private byte[] yjsState;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    public void onSave() {
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateState(byte[] state) {
        this.yjsState = state;
    }
}
