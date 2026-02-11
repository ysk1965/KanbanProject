-- Notes feature: documents and folders with tree structure
CREATE TABLE notes (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL,
    parent_id VARCHAR(36),
    type VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    position INT NOT NULL DEFAULT 0,
    depth INT NOT NULL DEFAULT 0,
    created_by VARCHAR(36) NOT NULL,
    updated_by VARCHAR(36) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_notes_board FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    CONSTRAINT fk_notes_parent FOREIGN KEY (parent_id) REFERENCES notes(id) ON DELETE CASCADE,
    CONSTRAINT fk_notes_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_notes_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
    CONSTRAINT chk_notes_type CHECK (type IN ('FOLDER', 'DOCUMENT')),
    CONSTRAINT chk_notes_depth CHECK (depth >= 0 AND depth <= 4)
);

CREATE INDEX idx_notes_board_id ON notes(board_id);
CREATE INDEX idx_notes_parent_id ON notes(parent_id);
CREATE INDEX idx_notes_board_not_deleted ON notes(board_id, is_deleted);

-- Note tags
CREATE TABLE note_tags (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_note_tags_board FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    CONSTRAINT uq_note_tags_board_name UNIQUE (board_id, name)
);

CREATE INDEX idx_note_tags_board_id ON note_tags(board_id);

-- Note-tag mappings
CREATE TABLE note_tag_mappings (
    note_id VARCHAR(36) NOT NULL,
    tag_id VARCHAR(36) NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    CONSTRAINT fk_ntm_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    CONSTRAINT fk_ntm_tag FOREIGN KEY (tag_id) REFERENCES note_tags(id) ON DELETE CASCADE
);

-- Note version history
CREATE TABLE note_versions (
    id VARCHAR(36) PRIMARY KEY,
    note_id VARCHAR(36) NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    version_number INT NOT NULL,
    created_by VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_note_versions_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    CONSTRAINT fk_note_versions_created_by FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX idx_note_versions_note_id ON note_versions(note_id);
