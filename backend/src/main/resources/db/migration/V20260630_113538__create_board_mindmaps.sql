-- Board mind map: one row per board, whole canvas (nodes + edges) stored as JSON in `data` TEXT
CREATE TABLE IF NOT EXISTS board_mindmaps (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL,
    data TEXT,
    updated_by VARCHAR(36),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);

-- One mind map per board
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_board_mindmap_board') THEN
        ALTER TABLE board_mindmaps ADD CONSTRAINT uk_board_mindmap_board UNIQUE (board_id);
    END IF;
END $$;

-- FK to boards
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_board_mindmap_board') THEN
        ALTER TABLE board_mindmaps ADD CONSTRAINT fk_board_mindmap_board
            FOREIGN KEY (board_id) REFERENCES boards(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_board_mindmap_board ON board_mindmaps(board_id);
