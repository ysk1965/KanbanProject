-- Yjs collaboration state storage for real-time note editing
CREATE TABLE note_collab_states (
    note_id VARCHAR(36) PRIMARY KEY,
    yjs_state BYTEA,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_ncs_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);
