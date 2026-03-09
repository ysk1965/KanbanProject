-- Board Join Requests table
CREATE TABLE IF NOT EXISTS board_join_requests (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL REFERENCES boards(id),
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    message TEXT,
    reviewed_by VARCHAR(36) REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bjr_board_status ON board_join_requests(board_id, status);
CREATE INDEX IF NOT EXISTS idx_bjr_user ON board_join_requests(user_id);

-- Partial unique index: only one PENDING request per user per board
CREATE UNIQUE INDEX IF NOT EXISTS uk_bjr_board_user_pending
    ON board_join_requests(board_id, user_id)
    WHERE status = 'PENDING';
