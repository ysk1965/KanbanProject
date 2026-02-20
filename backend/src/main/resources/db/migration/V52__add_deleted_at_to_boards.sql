-- Board soft delete support
ALTER TABLE boards ADD COLUMN deleted_at TIMESTAMP;

-- Index for scheduler cleanup query
CREATE INDEX idx_boards_deleted_at ON boards(deleted_at) WHERE deleted_at IS NOT NULL;
